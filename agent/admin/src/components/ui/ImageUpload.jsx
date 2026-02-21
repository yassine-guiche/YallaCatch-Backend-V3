import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { validateFile } from '../../services/upload';
import { getImageUrl } from '../../utils/images';

/**
 * ImageUpload Component - Reusable image upload with drag-and-drop and preview
 * 
 * @param {Object} props
 * @param {string} props.value - Current image URL
 * @param {Function} props.onChange - Callback when image changes (receives file or null)
 * @param {Function} props.onUpload - Async function to handle upload (receives file)
 * @param {string} props.label - Label text
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Disable the component
 * @param {string} props.error - Error message to display
 */
export function ImageUpload({
    value,
    onChange,
    onUpload,
    label = 'Image',
    placeholder = 'Cliquez ou déposez une image',
    className = '',
    disabled = false,
    error: externalError,
}) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(value || null);
    const fileInputRef = useRef(null);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
            setIsDragging(true);
        }
    }, [disabled]);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const processFile = useCallback(async (file) => {
        if (!file || disabled) return;

        // Validate file
        const validation = validateFile(file);
        if (!validation.valid) {
            setError(validation.error);
            return;
        }

        setError(null);

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setPreview(e.target.result);
        };
        reader.readAsDataURL(file);

        // If onUpload is provided, upload the file
        if (onUpload) {
            setIsUploading(true);
            setProgress(0);

            try {
                const result = await onUpload(file, (percent) => setProgress(percent));

                if (result?.success && result?.url) {
                    // Use the uploaded URL
                    onChange?.(result.url);
                    setPreview(getImageUrl(result.url));
                } else {
                    setError(result?.error || 'Upload failed');
                    setPreview(value); // Revert to original
                }
            } catch (err) {
                setError(err?.message || 'Upload failed');
                setPreview(value); // Revert to original
            } finally {
                setIsUploading(false);
                setProgress(0);
            }
        } else {
            // Just notify parent with the file
            onChange?.(file);
        }
    }, [disabled, onChange, onUpload, value]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer?.files;
        if (files?.length > 0) {
            processFile(files[0]);
        }
    }, [processFile]);

    const handleClick = useCallback(() => {
        if (!disabled && !isUploading) {
            fileInputRef.current?.click();
        }
    }, [disabled, isUploading]);

    const handleFileChange = useCallback((e) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    }, [processFile]);

    const handleRemove = useCallback((e) => {
        e.stopPropagation();
        setPreview(null);
        setError(null);
        onChange?.(null);
    }, [onChange]);

    const displayError = externalError || error;
    const hasImage = preview || value;

    // Determine preview URL (handle both relative and absolute URLs)
    const getPreviewUrl = () => {
        if (!hasImage) return null;
        return getImageUrl(preview || value);
    };

    return (
        <div className={`image-upload ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    {label}
                </label>
            )}

            <div
                onClick={handleClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
          relative border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${displayError ? 'border-red-500 bg-red-50' : ''}
        `}
                style={{ minHeight: '120px' }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={disabled || isUploading}
                />

                {isUploading ? (
                    <div className="flex flex-col items-center justify-center p-6 h-full">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                        <p className="text-sm text-gray-600">Uploading... {progress}%</p>
                        <div className="w-full max-w-xs bg-gray-200 rounded-full h-2 mt-2">
                            <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-200"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                ) : hasImage ? (
                    <div className="relative p-2 h-full">
                        <img
                            src={getPreviewUrl()}
                            alt="Preview"
                            className="w-full h-32 object-contain rounded"
                            onError={(e) => {
                                e.target.style.display = 'none';
                            }}
                        />
                        {!disabled && (
                            <button
                                onClick={handleRemove}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                title="Supprimer l'image"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-6 h-full">
                        {isDragging ? (
                            <>
                                <Upload className="w-10 h-10 text-blue-500 mb-2" />
                                <p className="text-sm text-blue-600">Déposez l'image ici</p>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="w-10 h-10 text-gray-400 mb-2" />
                                <p className="text-sm text-gray-500">{placeholder}</p>
                                <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP (max 10MB)</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {displayError && (
                <div className="flex items-center mt-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {displayError}
                </div>
            )}
        </div>
    );
}

export default ImageUpload;
