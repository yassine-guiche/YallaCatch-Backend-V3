/**
 * QR Scanner Component
 * Rich QR code scanning solution for YallaCatch redemptions
 * Uses html5-qrcode library for reliable cross-browser scanning
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
    Camera,
    CameraOff,
    Keyboard,
    CheckCircle,
    XCircle,
    RefreshCw,
    Flashlight,
    SwitchCamera,
    Volume2,
    VolumeX
} from 'lucide-react';

// YallaCatch QR code format parser
const parseYallaCatchQR = (rawData) => {
    try {
        // Try to parse directly as JSON first
        let parsed;

        // Check if it's base64 encoded (starts with 'ey' which is '{"' in base64)
        if (rawData.startsWith('ey') && rawData.length > 100) {
            const decoded = atob(rawData);
            parsed = JSON.parse(decoded);
        } else {
            // Try direct JSON parse
            parsed = JSON.parse(rawData);
        }

        // Validate it's a YallaCatch QR code
        if (parsed.type === 'yallacatch_redemption' && parsed.code) {
            return {
                isValid: true,
                type: 'yallacatch_redemption',
                code: parsed.code,
                itemId: parsed.itemId || null,
                rewardId: parsed.rewardId || null,
                redemptionId: parsed.redemptionId || null,
                partnerId: parsed.partnerId || null,
                timestamp: parsed.timestamp || null,
                raw: rawData
            };
        }

        // Unknown JSON format
        return {
            isValid: false,
            type: 'unknown_json',
            raw: rawData,
            error: 'Not a YallaCatch redemption QR code'
        };
    } catch {
        // Not JSON - treat as plain redemption code
        if (rawData && rawData.length >= 6 && rawData.length <= 50) {
            return {
                isValid: true,
                type: 'plain_code',
                code: rawData,
                raw: rawData
            };
        }

        return {
            isValid: false,
            type: 'invalid',
            raw: rawData,
            error: 'Invalid QR code format'
        };
    }
};

// Success sound (base64 encoded beep)
const successSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdXCKnotsdmd1f5GXkYN0Z215iJOTh3l0eYWNj4mAd3uGjI6IgHl+hYqLiYF7f4aKioiBfYGHioiGgn+Eh4mHhYN/g4eJh4SDgIOHiIeEg4CEh4eGhIOCg4aHhoSDg4SGhoWEg4OEhoWEhIODhIWGhYSDhIOEhYWEg4OEhIWFhYSDhISEhIWEg4SEhISEhIODhISEhISEhISEhISDg4SEhISDg4OEhISDg4OEhISEhISEhISEhIODhISEhISDg4SEhISDg4SEhISEg4OEhISEhISEhISEhIODhISD');

export default function QRScanner({
    onScan,
    onError,
    onClose,
    autoValidate = false,
    showManualInput = true,
    soundEnabled = true,
    className = ''
}) {
    const [mode, setMode] = useState('camera'); // 'camera' or 'manual'
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [cameras, setCameras] = useState([]);
    const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
    const [torchEnabled, setTorchEnabled] = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);
    const [lastScanned, setLastScanned] = useState(null);
    const [scanStatus, setScanStatus] = useState(null); // 'success' | 'error' | null
    const [manualCode, setManualCode] = useState('');
    const [processing, setProcessing] = useState(false);
    const [soundOn, setSoundOn] = useState(soundEnabled);

    const scannerRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const scannerIdRef = useRef(`qr-scanner-${Date.now()}`);

    // Play success sound
    const playSuccessSound = useCallback(() => {
        if (soundOn) {
            try {
                successSound.currentTime = 0;
                successSound.play().catch(() => { });
                // Haptic feedback if supported
                if (navigator.vibrate) {
                    navigator.vibrate(100);
                }
            } catch (e) {
                console.debug('Sound play failed:', e);
            }
        }
    }, [soundOn]);

    // Handle successful scan
    const handleScanSuccess = useCallback(async (decodedText) => {
        if (processing || lastScanned === decodedText) return;

        setProcessing(true);
        setLastScanned(decodedText);

        const parsed = parseYallaCatchQR(decodedText);

        if (parsed.isValid) {
            playSuccessSound();
            setScanStatus('success');

            // Stop camera to prevent double scans
            if (html5QrCodeRef.current && cameraActive) {
                try {
                    await html5QrCodeRef.current.stop();
                    setCameraActive(false);
                } catch (e) {
                    console.debug('Stop camera after scan:', e);
                }
            }

            if (autoValidate) {
                // Call the onScan with the code directly
                onScan?.(parsed.code, parsed);
            } else {
                // Return parsed data for manual handling
                onScan?.(parsed.code, parsed);
            }
        } else {
            setScanStatus('error');
            onError?.(parsed.error || 'Invalid QR code', parsed);

            // Reset after showing error briefly
            setTimeout(() => {
                setScanStatus(null);
                setLastScanned(null);
                setProcessing(false);
            }, 2000);
        }
    }, [processing, lastScanned, cameraActive, autoValidate, onScan, onError, playSuccessSound]);

    // Handle scan error (not critical, just logging)
    const handleScanError = useCallback((error) => {
        // Ignore common scanning errors (no QR in frame, etc.)
        if (error?.includes?.('NotFoundError') || error?.includes?.('NotFoundException')) {
            return;
        }
        console.debug('QR scan frame error:', error);
    }, []);

    // Initialize camera scanner
    const startCamera = useCallback(async () => {
        if (!scannerRef.current) return;

        setCameraError(null);
        setScanStatus(null);
        setLastScanned(null);
        setProcessing(false);

        try {
            // Get available cameras
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
                setCameras(devices);

                // Prefer back camera on mobile
                const backCameraIndex = devices.findIndex(d =>
                    d.label.toLowerCase().includes('back') ||
                    d.label.toLowerCase().includes('rear') ||
                    d.label.toLowerCase().includes('environment')
                );
                const cameraIndex = backCameraIndex >= 0 ? backCameraIndex : 0;
                setCurrentCameraIndex(cameraIndex);

                // Initialize scanner
                const html5QrCode = new Html5Qrcode(scannerIdRef.current, {
                    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                    verbose: false
                });
                html5QrCodeRef.current = html5QrCode;

                // Start scanning
                await html5QrCode.start(
                    devices[cameraIndex].id,
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                        disableFlip: false
                    },
                    handleScanSuccess,
                    handleScanError
                );

                setCameraActive(true);

                // Check torch support
                try {
                    const capabilities = html5QrCode.getRunningTrackCameraCapabilities();
                    if (capabilities.torchFeature && capabilities.torchFeature().isSupported()) {
                        setTorchSupported(true);
                    }
                } catch (e) {
                    console.debug('Torch check failed:', e);
                }
            } else {
                setCameraError('Aucune caméra détectée');
            }
        } catch (error) {
            console.error('Camera init error:', error);
            setCameraError(
                error.name === 'NotAllowedError'
                    ? 'Accès à la caméra refusé. Veuillez autoriser l\'accès dans les paramètres.'
                    : error.name === 'NotFoundError'
                        ? 'Aucune caméra disponible sur cet appareil.'
                        : `Erreur caméra: ${error.message || error}`
            );
        }
    }, [handleScanSuccess, handleScanError]);

    // Stop camera
    const stopCamera = useCallback(async () => {
        if (html5QrCodeRef.current && cameraActive) {
            try {
                await html5QrCodeRef.current.stop();
                html5QrCodeRef.current = null;
            } catch (error) {
                console.debug('Stop camera error:', error);
            }
        }
        setCameraActive(false);
        setTorchEnabled(false);
    }, [cameraActive]);

    // Switch camera
    const switchCamera = useCallback(async () => {
        if (cameras.length <= 1) return;

        await stopCamera();
        const nextIndex = (currentCameraIndex + 1) % cameras.length;
        setCurrentCameraIndex(nextIndex);

        setTimeout(() => startCamera(), 100);
    }, [cameras, currentCameraIndex, stopCamera, startCamera]);

    // Toggle torch
    const toggleTorch = useCallback(async () => {
        if (!html5QrCodeRef.current || !torchSupported) return;

        try {
            const capabilities = html5QrCodeRef.current.getRunningTrackCameraCapabilities();
            if (capabilities.torchFeature) {
                await capabilities.torchFeature().apply(!torchEnabled);
                setTorchEnabled(!torchEnabled);
            }
        } catch (e) {
            console.debug('Torch toggle failed:', e);
        }
    }, [torchSupported, torchEnabled]);

    // Handle manual code submission
    const handleManualSubmit = useCallback(() => {
        const code = manualCode.trim();
        if (!code) return;

        const parsed = parseYallaCatchQR(code);
        if (parsed.isValid) {
            playSuccessSound();
            onScan?.(parsed.code, parsed);
        } else {
            onError?.(parsed.error || 'Code invalide', parsed);
        }
    }, [manualCode, onScan, onError, playSuccessSound]);

    // Mode change handler
    const handleModeChange = useCallback((newMode) => {
        if (newMode === mode) return;

        if (mode === 'camera' && cameraActive) {
            stopCamera();
        }

        setMode(newMode);
        setScanStatus(null);
        setLastScanned(null);
        setProcessing(false);

        if (newMode === 'camera') {
            setTimeout(() => startCamera(), 100);
        }
    }, [mode, cameraActive, stopCamera, startCamera]);

    // Initialize on mount
    useEffect(() => {
        if (mode === 'camera') {
            startCamera();
        }

        return () => {
            stopCamera();
        };
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (html5QrCodeRef.current) {
                html5QrCodeRef.current.stop().catch(() => { });
            }
        };
    }, []);

    return (
        <Card className={`overflow-hidden ${className}`}>
            <CardContent className="p-4 space-y-4">
                {/* Mode Toggle */}
                <div className="flex gap-2">
                    <Button
                        variant={mode === 'camera' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => handleModeChange('camera')}
                    >
                        <Camera className="h-4 w-4 mr-2" />
                        Caméra
                    </Button>
                    {showManualInput && (
                        <Button
                            variant={mode === 'manual' ? 'default' : 'outline'}
                            className="flex-1"
                            onClick={() => handleModeChange('manual')}
                        >
                            <Keyboard className="h-4 w-4 mr-2" />
                            Manuel
                        </Button>
                    )}
                </div>

                {/* Camera Mode */}
                {mode === 'camera' && (
                    <div className="space-y-3">
                        {cameraError ? (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
                                <CameraOff className="h-8 w-8 mx-auto mb-2 text-red-400" />
                                {cameraError}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-3"
                                    onClick={startCamera}
                                >
                                    <RefreshCw className="h-4 w-4 mr-1" />
                                    Réessayer
                                </Button>
                            </div>
                        ) : (
                            <>
                                {/* Scanner viewport */}
                                <div
                                    className="relative bg-black rounded-lg overflow-hidden"
                                    style={{ minHeight: '300px' }}
                                >
                                    <div
                                        id={scannerIdRef.current}
                                        ref={scannerRef}
                                        className="w-full h-full"
                                    />

                                    {/* Scan status overlay */}
                                    {scanStatus && (
                                        <div className={`absolute inset-0 flex items-center justify-center bg-black/50 z-10`}>
                                            {scanStatus === 'success' ? (
                                                <div className="text-center text-white">
                                                    <CheckCircle className="h-16 w-16 mx-auto text-green-400 mb-2" />
                                                    <p className="font-medium">QR Code Scanné!</p>
                                                </div>
                                            ) : (
                                                <div className="text-center text-white">
                                                    <XCircle className="h-16 w-16 mx-auto text-red-400 mb-2" />
                                                    <p className="font-medium">Code Invalide</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Loading overlay */}
                                    {!cameraActive && !cameraError && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                                            <RefreshCw className="h-8 w-8 text-white animate-spin" />
                                        </div>
                                    )}
                                </div>

                                {/* Camera controls */}
                                <div className="flex items-center justify-center gap-3">
                                    {cameras.length > 1 && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={switchCamera}
                                            disabled={!cameraActive}
                                        >
                                            <SwitchCamera className="h-4 w-4 mr-1" />
                                            Changer
                                        </Button>
                                    )}

                                    {torchSupported && (
                                        <Button
                                            variant={torchEnabled ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={toggleTorch}
                                            disabled={!cameraActive}
                                        >
                                            <Flashlight className="h-4 w-4 mr-1" />
                                            Flash
                                        </Button>
                                    )}

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSoundOn(!soundOn)}
                                    >
                                        {soundOn ? (
                                            <Volume2 className="h-4 w-4" />
                                        ) : (
                                            <VolumeX className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>

                                {/* Status badge */}
                                <div className="flex justify-center">
                                    <Badge variant={cameraActive ? 'default' : 'secondary'}>
                                        {cameraActive ? 'Scanner actif - Pointez vers le QR code' : 'Initialisation...'}
                                    </Badge>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Manual Mode */}
                {mode === 'manual' && (
                    <div className="space-y-3">
                        <div>
                            <Input
                                placeholder="Collez le code de redemption ou le contenu du QR code..."
                                value={manualCode}
                                onChange={(e) => setManualCode(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                Formats acceptés: Code alphanumérique, JSON, ou base64
                            </p>
                        </div>

                        <Button
                            onClick={handleManualSubmit}
                            disabled={!manualCode.trim()}
                            className="w-full"
                        >
                            Valider le code
                        </Button>
                    </div>
                )}

                {/* Close button if onClose provided */}
                {onClose && (
                    <Button variant="outline" onClick={onClose} className="w-full">
                        Fermer
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

// Export the parser for use in other components
export { parseYallaCatchQR };
