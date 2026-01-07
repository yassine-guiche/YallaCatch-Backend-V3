import { ABTest, IABTest } from '@/models/ABTest';
import { typedLogger } from '@/lib/typed-logger';

export class ABTestingService {
  static async createTest(testData: Partial<IABTest>, userId: string) {
    try {
      // Validate traffic allocation sums to 100
      const totalTraffic = testData.variants?.reduce((sum, v) => sum + (v.trafficAllocation || 0), 0) || 0;
      if (testData.variants && totalTraffic !== 100) {
        throw new Error(`Traffic allocation must sum to 100%, got ${totalTraffic}%`);
      }

      // Ensure variants have default values for conversions and impressions
      const variants = (testData.variants || []).map(v => ({
        name: v.name || 'variant',
        trafficAllocation: v.trafficAllocation || 0,
        config: v.config || {},
        conversions: v.conversions || 0,
        impressions: v.impressions || 0
      }));

      const test = new ABTest({
        ...testData,
        variants,
        createdBy: userId,
        status: 'draft'
      });

      await test.save();
      typedLogger.info('A/B test created', { testId: test._id, name: test.name });
      return test;
    } catch (error) {
      typedLogger.error('Failed to create A/B test', { error });
      throw error;
    }
  }

  static async getTests(filters?: { status?: string; type?: string }) {
    try {
      const query: any = {};
      if (filters?.status) query.status = filters.status;
      if (filters?.type) query.type = filters.type;

      const tests = await ABTest.find(query).sort({ startDate: -1 }).populate('createdBy', 'username email');
      return tests;
    } catch (error) {
      typedLogger.error('Failed to fetch A/B tests', { error });
      throw error;
    }
  }

  static async getTestById(testId: string) {
    try {
      const test = await ABTest.findById(testId).populate('createdBy', 'username email');
      if (!test) throw new Error('Test not found');
      return test;
    } catch (error) {
      typedLogger.error('Failed to fetch A/B test', { testId, error });
      throw error;
    }
  }

  static async updateTest(testId: string, updates: Partial<IABTest>) {
    try {
      // If updating variants, validate traffic allocation
      if (updates.variants) {
        const totalTraffic = updates.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
        if (totalTraffic !== 100) {
          throw new Error(`Traffic allocation must sum to 100%, got ${totalTraffic}%`);
        }
      }

      const test = await ABTest.findByIdAndUpdate(testId, { ...updates, updatedAt: new Date() }, { new: true });
      typedLogger.info('A/B test updated', { testId });
      return test;
    } catch (error) {
      typedLogger.error('Failed to update A/B test', { testId, error });
      throw error;
    }
  }

  static async startTest(testId: string) {
    try {
      const test = await ABTest.findByIdAndUpdate(
        testId,
        { status: 'active', startDate: new Date() },
        { new: true }
      );
      typedLogger.info('A/B test started', { testId });
      return test;
    } catch (error) {
      typedLogger.error('Failed to start A/B test', { testId, error });
      throw error;
    }
  }

  static async pauseTest(testId: string) {
    try {
      const test = await ABTest.findByIdAndUpdate(testId, { status: 'paused' }, { new: true });
      typedLogger.info('A/B test paused', { testId });
      return test;
    } catch (error) {
      typedLogger.error('Failed to pause A/B test', { testId, error });
      throw error;
    }
  }

  static async endTest(testId: string) {
    try {
      // Calculate winner based on statistical significance
      const test = await this.getTestById(testId);
      const winnerVariant = await this.selectWinner(test);

      const updated = await ABTest.findByIdAndUpdate(
        testId,
        { status: 'ended', endDate: new Date(), winnerVariant },
        { new: true }
      );

      typedLogger.info('A/B test ended', { testId, winner: winnerVariant });
      return updated;
    } catch (error) {
      typedLogger.error('Failed to end A/B test', { testId, error });
      throw error;
    }
  }

  static async deleteTest(testId: string) {
    try {
      await ABTest.findByIdAndDelete(testId);
      typedLogger.info('A/B test deleted', { testId });
    } catch (error) {
      typedLogger.error('Failed to delete A/B test', { testId, error });
      throw error;
    }
  }

  static async recordConversion(testId: string, variantName: string, conversionValue: number = 1) {
    try {
      await ABTest.findByIdAndUpdate(
        testId,
        {
          $inc: {
            'variants.$[elem].conversions': conversionValue
          }
        },
        {
          arrayFilters: [{ 'elem.name': variantName }],
          new: true
        }
      );
    } catch (error) {
      typedLogger.error('Failed to record conversion', { testId, variantName, error });
      throw error;
    }
  }

  static async recordImpression(testId: string, variantName: string) {
    try {
      await ABTest.findByIdAndUpdate(
        testId,
        {
          $inc: {
            'variants.$[elem].impressions': 1
          }
        },
        {
          arrayFilters: [{ 'elem.name': variantName }],
          new: true
        }
      );
    } catch (error) {
      typedLogger.error('Failed to record impression', { testId, variantName, error });
      throw error;
    }
  }

  static async getMetrics(testId: string) {
    try {
      const test = await this.getTestById(testId);
      if (!test) throw new Error('Test not found');

      const metricsData = test.variants.map(v => ({
        name: v.name,
        traffic: v.trafficAllocation,
        impressions: v.impressions,
        conversions: v.conversions,
        conversionRate: v.impressions > 0 ? (v.conversions / v.impressions * 100).toFixed(2) : '0.00'
      }));

      return {
        testName: test.name,
        status: test.status,
        variants: metricsData,
        winner: test.winnerVariant,
        confidence: test.confidenceLevel
      };
    } catch (error) {
      typedLogger.error('Failed to get metrics', { testId, error });
      throw error;
    }
  }

  static async selectWinner(test: IABTest): Promise<string | undefined> {
    try {
      if (test.variants.length === 0) return undefined;

      // Calculate significance using chi-square test
      const controlVariant = test.variants[0];
      let winner = controlVariant.name;
      let highestSignificance = 0;

      for (let i = 1; i < test.variants.length; i++) {
        const testVariant = test.variants[i];
        const chisquare = this.calculateChiSquare(controlVariant, testVariant);
        const significance = this.getSignificanceLevel(chisquare);

        if (significance > test.confidenceLevel && significance > highestSignificance) {
          winner = testVariant.name;
          highestSignificance = significance;
        }
      }

      return winner;
    } catch (error) {
      typedLogger.error('Failed to select winner', { error });
      return test.variants[0]?.name;
    }
  }

  private static calculateChiSquare(variant1: any, variant2: any): number {
    const control = {
      conversions: variant1.conversions,
      nonConversions: variant1.impressions - variant1.conversions
    };

    const test = {
      conversions: variant2.conversions,
      nonConversions: variant2.impressions - variant2.conversions
    };

    const totalConversions = control.conversions + test.conversions;
    const totalNonConversions = control.nonConversions + test.nonConversions;
    const totalSamples = totalConversions + totalNonConversions;

    if (totalSamples === 0) return 0;

    const expectedControl = (control.conversions + control.nonConversions) * (totalConversions / totalSamples);
    const expectedTest = (test.conversions + test.nonConversions) * (totalConversions / totalSamples);

    const chi2 = 
      Math.pow(control.conversions - expectedControl, 2) / (expectedControl || 1) +
      Math.pow(test.conversions - expectedTest, 2) / (expectedTest || 1);

    return chi2;
  }

  private static getSignificanceLevel(chiSquare: number): number {
    // Simple mapping of chi-square to significance level
    // 3.84 = 95% confidence, 6.64 = 99% confidence
    if (chiSquare > 6.64) return 0.99;
    if (chiSquare > 3.84) return 0.95;
    return chiSquare / 3.84 * 0.95;
  }

  static async getActiveTests() {
    try {
      return await ABTest.find({ status: 'active' }).sort({ startDate: -1 });
    } catch (error) {
      typedLogger.error('Failed to fetch active tests', { error });
      throw error;
    }
  }

  static async getTestResults(testId: string) {
    try {
      const test = await this.getTestById(testId);
      const metrics = test.variants.map(v => ({
        name: v.name,
        traffic: v.trafficAllocation,
        conversions: v.conversions,
        conversionRate: v.impressions > 0 ? (v.conversions / v.impressions) : 0,
        winningChance: 0 // Will be calculated based on statistical significance
      }));

      return {
        test: {
          id: test._id,
          name: test.name,
          status: test.status,
          type: test.type,
          startDate: test.startDate,
          endDate: test.endDate,
          winner: test.winnerVariant
        },
        metrics,
        recommendation: test.winnerVariant ? `Winner: ${test.winnerVariant}` : 'Test still running'
      };
    } catch (error) {
      typedLogger.error('Failed to get test results', { testId, error });
      throw error;
    }
  }
}
