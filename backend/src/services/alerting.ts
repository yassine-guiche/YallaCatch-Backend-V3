import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';
import nodemailer from 'nodemailer';
import { Twilio } from 'twilio';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Alert channels
 */
export enum AlertChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
}

/**
 * Alert interface
 */
export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  timestamp: Date;
  source: string;
  metadata?: Record<string, any>;
  channels: AlertChannel[];
}

/**
 * Alert rule interface
 */
export interface AlertRule {
  name: string;
  condition: (alert: Alert) => boolean;
  channels: AlertChannel[];
  cooldown?: number; // Minutes between same alerts
  enabled: boolean;
}

/**
 * Alerting service
 */
export class AlertingService {
  private emailTransporter?: nodemailer.Transporter;
  private twilioClient?: Twilio;
  private alertHistory = new Map<string, Date>();
  private rules: AlertRule[] = [];

  constructor() {
    this.initializeTransports();
    this.setupDefaultRules();
  }

  private initializeTransports(): void {
    // Initialize email transporter
    if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
      this.emailTransporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        },
      });
    }

    // Initialize Twilio client
    if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
      this.twilioClient = new Twilio(
        config.TWILIO_ACCOUNT_SID,
        config.TWILIO_AUTH_TOKEN
      );
    }
  }

  private setupDefaultRules(): void {
    // Critical errors - immediate notification
    this.addRule({
      name: 'critical_errors',
      condition: (alert) => alert.severity === AlertSeverity.CRITICAL,
      channels: [AlertChannel.EMAIL, AlertChannel.SMS],
      cooldown: 5, // 5 minutes
      enabled: true,
    });

    // High severity - email notification
    this.addRule({
      name: 'high_severity',
      condition: (alert) => alert.severity === AlertSeverity.HIGH,
      channels: [AlertChannel.EMAIL],
      cooldown: 15, // 15 minutes
      enabled: true,
    });

    // Database connection issues
    this.addRule({
      name: 'database_issues',
      condition: (alert) => 
        alert.source.includes('database') || 
        alert.source.includes('mongodb') ||
        alert.message.toLowerCase().includes('connection'),
      channels: [AlertChannel.EMAIL, AlertChannel.WEBHOOK],
      cooldown: 10,
      enabled: true,
    });

    // Security incidents
    this.addRule({
      name: 'security_incidents',
      condition: (alert) => 
        alert.source.includes('security') ||
        alert.message.toLowerCase().includes('breach') ||
        alert.message.toLowerCase().includes('attack'),
      channels: [AlertChannel.EMAIL, AlertChannel.SMS],
      cooldown: 0, // No cooldown for security
      enabled: true,
    });

    // Rate limiting exceeded frequently
    this.addRule({
      name: 'rate_limit_abuse',
      condition: (alert) => 
        alert.source.includes('rate_limit') && 
        alert.severity === AlertSeverity.HIGH,
      channels: [AlertChannel.EMAIL],
      cooldown: 30,
      enabled: true,
    });
  }

  /**
   * Add an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove an alert rule
   */
  removeRule(name: string): void {
    this.rules = this.rules.filter(rule => rule.name !== name);
  }

  /**
   * Send an alert
   */
  async sendAlert(alert: Alert): Promise<void> {
    try {
      // Check which rules match this alert
      const matchingRules = this.rules.filter(rule => 
        rule.enabled && rule.condition(alert)
      );

      if (matchingRules.length === 0) {
        typedLogger.debug('No matching alert rules', { alertId: alert.id });
        return;
      }

      // Check cooldown for each rule
      const activeRules = matchingRules.filter(rule => {
        const cooldownKey = `${rule.name}:${alert.source}`;
        const lastAlert = this.alertHistory.get(cooldownKey);
        
        if (!lastAlert || !rule.cooldown) {
          return true;
        }

        const cooldownMs = rule.cooldown * 60 * 1000;
        return Date.now() - lastAlert.getTime() > cooldownMs;
      });

      if (activeRules.length === 0) {
        typedLogger.debug('All matching rules in cooldown', { alertId: alert.id });
        return;
      }

      // Collect all channels from active rules
      const channels = new Set<AlertChannel>();
      activeRules.forEach(rule => {
        rule.channels.forEach(channel => channels.add(channel));
      });

      // Send to each channel
      const promises = Array.from(channels).map(channel => 
        this.sendToChannel(alert, channel)
      );

      await Promise.allSettled(promises);

      // Update cooldown history
      activeRules.forEach(rule => {
        const cooldownKey = `${rule.name}:${alert.source}`;
        this.alertHistory.set(cooldownKey, new Date());
      });

      typedLogger.info('Alert sent successfully', {
        alertId: alert.id,
        channels: Array.from(channels),
        rules: activeRules.map(r => r.name),
      });

    } catch (error) {
      typedLogger.error('Failed to send alert', {
        alertId: alert.id,
        error: (error as any).message,
      });
    }
  }

  /**
   * Send alert to specific channel
   */
  private async sendToChannel(alert: Alert, channel: AlertChannel): Promise<void> {
    switch (channel) {
      case AlertChannel.EMAIL:
        await this.sendEmailAlert(alert);
        break;
      case AlertChannel.SMS:
        await this.sendSmsAlert(alert);
        break;
      case AlertChannel.WEBHOOK:
        await this.sendWebhookAlert(alert);
        break;
      case AlertChannel.SLACK:
        await this.sendSlackAlert(alert);
        break;
      default:
        typedLogger.warn('Unknown alert channel', { channel });
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.emailTransporter) {
      typedLogger.warn('Email transporter not configured');
      return;
    }

    const recipients = this.getEmailRecipients(alert.severity);
    if (recipients.length === 0) {
      typedLogger.warn('No email recipients configured');
      return;
    }

    const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
    const html = this.generateEmailHtml(alert);

    await this.emailTransporter.sendMail({
      from: config.EMAIL_FROM,
      to: recipients.join(', '),
      subject,
      html,
    });

    typedLogger.info('Email alert sent', {
      alertId: alert.id,
      recipients: recipients.length,
    });
  }

  /**
   * Send SMS alert
   */
  private async sendSmsAlert(alert: Alert): Promise<void> {
    if (!this.twilioClient) {
      typedLogger.warn('Twilio client not configured');
      return;
    }

    const recipients = this.getSmsRecipients(alert.severity);
    if (recipients.length === 0) {
      typedLogger.warn('No SMS recipients configured');
      return;
    }

    const message = `[${alert.severity.toUpperCase()}] ${alert.title}\n\n${alert.message}`;

    const promises = recipients.map(async (phone) => {
      try {
        await this.twilioClient!.messages.create({
          body: message,
          from: config.TWILIO_PHONE_NUMBER,
          to: phone,
        });
      } catch (error) {
        typedLogger.error('Failed to send SMS', { phone, error: (error as any).message });
      }
    });

    await Promise.allSettled(promises);

    typedLogger.info('SMS alerts sent', {
      alertId: alert.id,
      recipients: recipients.length,
    });
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: Alert): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      typedLogger.warn('Webhook URL not configured');
      return;
    }

    const axios = (await import('axios')).default;
    
    await axios.post(webhookUrl, {
      alert,
      timestamp: new Date().toISOString(),
      service: 'yallacatch-backend',
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'YallaCatch-Alerting/1.0',
      },
    });

    typedLogger.info('Webhook alert sent', { alertId: alert.id });
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alert: Alert): Promise<void> {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhookUrl) {
      typedLogger.warn('Slack webhook URL not configured');
      return;
    }

    const axios = (await import('axios')).default;
    
    const color = this.getSeverityColor(alert.severity);
    const payload = {
      attachments: [{
        color,
        title: alert.title,
        text: alert.message,
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true,
          },
          {
            title: 'Source',
            value: alert.source,
            short: true,
          },
          {
            title: 'Timestamp',
            value: alert.timestamp.toISOString(),
            short: true,
          },
        ],
        footer: 'YallaCatch Backend',
        ts: Math.floor(alert.timestamp.getTime() / 1000),
      }],
    };

    await axios.post(slackWebhookUrl, payload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    typedLogger.info('Slack alert sent', { alertId: alert.id });
  }

  /**
   * Get email recipients based on severity
   */
  private getEmailRecipients(severity: AlertSeverity): string[] {
    const recipients: string[] = [];
    
    // Always include admin email
    if (config.ADMIN_EMAIL) {
      recipients.push(config.ADMIN_EMAIL);
    }

    // Include super admin emails for high/critical
    if (severity === AlertSeverity.HIGH || severity === AlertSeverity.CRITICAL) {
      // Cast to unknown first to handle different possible types
      const superAdminEmails = config.SUPER_ADMIN_EMAILS as unknown;
      let superAdmins: string[];

      if (superAdminEmails && Array.isArray(superAdminEmails)) {
        superAdmins = superAdminEmails as string[];
      } else if (superAdminEmails && typeof superAdminEmails === 'string') {
        superAdmins = (superAdminEmails as string).split(',') as string[];
      } else {
        superAdmins = [];
      }

      recipients.push(...superAdmins);
    }

    return [...new Set(recipients)]; // Remove duplicates
  }

  /**
   * Get SMS recipients based on severity
   */
  private getSmsRecipients(severity: AlertSeverity): string[] {
    // Only send SMS for critical alerts
    if (severity !== AlertSeverity.CRITICAL) {
      return [];
    }

    // Handle the environment variable as either a string to split or already an array
    const envValue = process.env.ALERT_SMS_RECIPIENTS;
    let recipients: string[];

    if (Array.isArray(envValue)) {
      recipients = envValue;
    } else if (typeof envValue === 'string') {
      recipients = envValue.split(',');
    } else {
      recipients = [];
    }

    return recipients.filter(phone => phone.trim());
  }

  /**
   * Generate HTML for email alerts
   */
  private generateEmailHtml(alert: Alert): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .alert { border-left: 4px solid ${this.getSeverityColor(alert.severity)}; padding: 20px; background: #f9f9f9; }
          .severity { color: ${this.getSeverityColor(alert.severity)}; font-weight: bold; text-transform: uppercase; }
          .metadata { background: #fff; padding: 10px; margin-top: 10px; border-radius: 4px; }
          .timestamp { color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="alert">
          <h2>${alert.title}</h2>
          <p class="severity">Severity: ${alert.severity}</p>
          <p><strong>Source:</strong> ${alert.source}</p>
          <p><strong>Message:</strong></p>
          <p>${alert.message}</p>
          
          ${alert.metadata ? `
            <div class="metadata">
              <strong>Additional Information:</strong>
              <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
            </div>
          ` : ''}
          
          <p class="timestamp">
            <strong>Timestamp:</strong> ${alert.timestamp.toISOString()}
          </p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get color for severity level
   */
  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.LOW:
        return '#36a2eb';
      case AlertSeverity.MEDIUM:
        return '#ffcd56';
      case AlertSeverity.HIGH:
        return '#ff6384';
      case AlertSeverity.CRITICAL:
        return '#ff0000';
      default:
        return '#666666';
    }
  }

  /**
   * Create and send an alert
   */
  async alert(
    title: string,
    message: string,
    severity: AlertSeverity,
    source: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      title,
      message,
      severity,
      source,
      timestamp: new Date(),
      metadata,
      channels: [], // Will be determined by rules
    };

    await this.sendAlert(alert);
  }
}

// Export singleton instance
export const alertingService = new AlertingService();

/**
 * Convenience functions for different severity levels
 */
export const alerts = {
  critical: (title: string, message: string, source: string, metadata?: Record<string, any>) =>
    alertingService.alert(title, message, AlertSeverity.CRITICAL, source, metadata),
  
  high: (title: string, message: string, source: string, metadata?: Record<string, any>) =>
    alertingService.alert(title, message, AlertSeverity.HIGH, source, metadata),
  
  medium: (title: string, message: string, source: string, metadata?: Record<string, any>) =>
    alertingService.alert(title, message, AlertSeverity.MEDIUM, source, metadata),
  
  low: (title: string, message: string, source: string, metadata?: Record<string, any>) =>
    alertingService.alert(title, message, AlertSeverity.LOW, source, metadata),
};

/**
 * Enhanced error handler with alerting
 */
export function createAlertingErrorHandler() {
  return async (error: any, request: any, reply: any) => {
    // Log the error
    typedLogger.error('Request error', {
      error: (error as any).message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      ip: request.ip,
      userId: request.user?.sub,
      statusCode: error.statusCode,
    });

    // Send alert for 5xx errors
    if (!error.statusCode || error.statusCode >= 500) {
      await alerts.high(
        'Server Error Detected',
        `${(error as any).message} on ${request.method} ${request.url}`,
        'error_handler',
        {
          error: (error as any).message,
          stack: error.stack,
          url: request.url,
          method: request.method,
          ip: request.ip,
          userId: request.user?.sub,
          statusCode: error.statusCode,
        }
      );
    }

    // Continue with normal error handling
    // ... (rest of error handling logic)
  };
}
