document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const qualityRange = document.getElementById('quality-range');
    const qualityVal = document.getElementById('quality-val');
    const losslessCheck = document.getElementById('lossless-check');
    const resultsSection = document.getElementById('results-section');
    const queueCount = document.getElementById('queue-count');
    const clearBtn = document.getElementById('clear-btn');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const totalOriginalSize = document.getElementById('total-original-size');
    const totalOptimizedSize = document.getElementById('total-optimized-size');
    const totalSavingPercent = document.getElementById('total-saving-percent');
    const filesGrid = document.getElementById('files-grid');
    const cardTemplate = document.getElementById('file-card-template');

    // Modal elements
    const compareModal = document.getElementById('compare-modal');
    const closeModal = document.getElementById('close-modal');
    const compareBeforeImg = document.getElementById('compare-before-img');
    const compareAfterImg = document.getElementById('compare-after-img');
    const compareFilename = document.getElementById('compare-filename');
    const compareOrigSize = document.getElementById('compare-orig-size');
    const compareWebpSize = document.getElementById('compare-webp-size');
    const compareSaving = document.getElementById('compare-saving');
    const sliderRangeControl = document.getElementById('slider-range-control');
    const comparisonContainer = document.querySelector('.comparison-slider-container');

    // State variables
    let filesQueue = [];
    let fileIdCounter = 0;

    // Quality slider label updater
    qualityRange.addEventListener('input', (e) => {
        qualityVal.textContent = `${e.target.value}%`;
    });

    // Lossless toggle adjustments
    losslessCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            qualityRange.disabled = true;
            qualityRange.style.opacity = '0.4';
            qualityVal.style.opacity = '0.4';
        } else {
            qualityRange.disabled = false;
            qualityRange.style.opacity = '1';
            qualityVal.style.opacity = '1';
        }
    });

    // Drag-and-drop event handlers
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            processFiles(files);
        }
    });

    // Click on drop zone triggers file input
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFiles(e.target.files);
            // Reset input so user can re-upload same file if they clear
            fileInput.value = '';
        }
    });

    // Main queue processor
    function processFiles(files) {
        resultsSection.classList.remove('hidden');

        Array.from(files).forEach(file => {
            // Ensure only images are processed (fallback to extension check if mime type is missing)
            const isImage = file.type.startsWith('image/') || 
                            /\.(jpe?g|png|gif|bmp|tiff?|webp)$/i.test(file.name);
            if (!isImage) {
                alert(`Skipping "${file.name}" because it is not a valid image format.`);
                return;
            }

            fileIdCounter++;
            const itemId = `file-${fileIdCounter}`;

            const item = {
                id: itemId,
                file: file,
                originalSize: file.size,
                optimizedSize: null,
                savingsPercent: null,
                originalUrl: null,
                webpUrl: null,
                optimizedName: null,
                status: 'uploading'
            };

            filesQueue.push(item);
            createCardElement(item);
            updateTotals();
            uploadAndConvert(item);
        });
    }

    // Card UI builder
    function createCardElement(item) {
        const clone = cardTemplate.content.cloneNode(true);
        const cardDiv = clone.querySelector('.file-card');
        cardDiv.id = item.id;

        // Set name and type
        cardDiv.querySelector('.file-name').textContent = item.file.name;
        const extension = item.file.name.split('.').pop().toUpperCase();
        cardDiv.querySelector('.file-type-badge').textContent = extension;

        // Setup local preview immediately before upload finishes
        const reader = new FileReader();
        reader.onload = (e) => {
            cardDiv.querySelector('.img-preview').src = e.target.result;
            item.originalUrl = e.target.result;
        };
        reader.readAsDataURL(item.file);

        // Delete button listener
        cardDiv.querySelector('.remove-btn').addEventListener('click', () => {
            removeQueueItem(item.id);
        });

        filesGrid.appendChild(cardDiv);
        item.element = document.getElementById(item.id);
    }

    // Single item removal
    function removeQueueItem(id) {
        const index = filesQueue.findIndex(f => f.id === id);
        if (index !== -1) {
            filesQueue.splice(index, 1);
        }
        const card = document.getElementById(id);
        if (card) {
            card.remove();
        }
        updateTotals();
        if (filesQueue.length === 0) {
            resultsSection.classList.add('hidden');
        }
    }

    // Upload & AJAX Handler
    function uploadAndConvert(item) {
        const formData = new FormData();
        formData.append('image', item.file);
        formData.append('quality', qualityRange.value);
        formData.append('lossless', losslessCheck.checked);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/convert/', true);

        // Track upload progress
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 90);
                updateProgressUI(item.id, percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        handleSuccess(item, response);
                    } else {
                        handleError(item, response.error || 'Optimization failed');
                    }
                } catch (err) {
                    handleError(item, 'Response parsing error');
                }
            } else {
                handleError(item, `Server Error (${xhr.status})`);
            }
        };

        xhr.onerror = () => {
            handleError(item, 'Network request failed');
        };

        xhr.send(formData);
    }

    // Progress bar updater
    function updateProgressUI(id, percent) {
        const card = document.getElementById(id);
        if (card) {
            const fill = card.querySelector('.progress-fill');
            if (fill) {
                fill.style.width = `${percent}%`;
            }
        }
    }

    // Successfully converted
    function handleSuccess(item, data) {
        item.status = 'success';
        item.optimizedSize = data.webp_size;
        item.savingsPercent = data.savings_percent;
        item.webpUrl = data.webp_data_url;
        item.originalUrl = data.original_data_url;
        item.optimizedName = data.filename;

        const card = document.getElementById(item.id);
        if (!card) return;

        // Complete progress bar
        updateProgressUI(item.id, 100);

        // Hide overlay loaders
        const overlay = card.querySelector('.status-overlay');
        if (overlay) overlay.style.display = 'none';

        // Update preview source with actual compressed WebP preview
        card.querySelector('.img-preview').src = data.webp_data_url;

        // Populate size details
        const sizeComp = card.querySelector('.size-comparison');
        sizeComp.querySelector('.orig-sz').textContent = formatBytes(item.originalSize);
        sizeComp.querySelector('.webp-sz').textContent = formatBytes(data.webp_size);
        
        const badge = sizeComp.querySelector('.saving-badge');
        badge.textContent = data.savings_percent >= 0 ? `-${data.savings_percent}%` : `+${Math.abs(data.savings_percent)}%`;
        if (data.savings_percent < 0) {
            badge.style.color = 'var(--danger-color)';
            badge.style.borderColor = 'rgba(244, 63, 94, 0.2)';
            badge.style.background = 'rgba(244, 63, 94, 0.1)';
        }
        sizeComp.classList.remove('hidden');

        // Setup action listeners
        const compareBtn = card.querySelector('.compare-btn');
        compareBtn.classList.remove('hidden');
        compareBtn.addEventListener('click', () => {
            openCompareModal(item);
        });

        const downloadBtn = card.querySelector('.download-btn');
        downloadBtn.classList.remove('hidden');
        downloadBtn.addEventListener('click', () => {
            triggerFileDownload(item);
        });

        updateTotals();
    }

    // Conversion failed
    function handleError(item, errMsg) {
        item.status = 'error';
        const card = document.getElementById(item.id);
        if (!card) return;

        const overlay = card.querySelector('.status-overlay');
        if (overlay) {
            overlay.querySelector('.spinner-icon').style.display = 'none';
            const statusTxt = overlay.querySelector('.status-text');
            statusTxt.textContent = 'Error';
            statusTxt.style.color = 'var(--danger-color)';
            card.style.borderColor = 'var(--danger-color)';
            overlay.title = errMsg;
        }
        updateTotals();
    }

    // Trigger single WebP file download
    function triggerFileDownload(item) {
        const link = document.createElement('a');
        link.href = item.webpUrl;
        link.download = item.optimizedName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Recalculate and update stats overview
    function updateTotals() {
        const completed = filesQueue.filter(f => f.status === 'success');
        queueCount.textContent = `${filesQueue.length} File${filesQueue.length !== 1 ? 's' : ''}`;

        let originalTotal = 0;
        let optimizedTotal = 0;

        filesQueue.forEach(f => {
            originalTotal += f.originalSize;
            if (f.status === 'success') {
                optimizedTotal += f.optimizedSize;
            } else {
                optimizedTotal += f.originalSize; // count unchanged until converted
            }
        });

        totalOriginalSize.textContent = formatBytes(originalTotal);
        totalOptimizedSize.textContent = formatBytes(optimizedTotal);

        if (completed.length > 0 && originalTotal > 0) {
            let totalSavedBytes = 0;
            let totalOrigBytesForCompleted = 0;
            
            completed.forEach(f => {
                totalSavedBytes += (f.originalSize - f.optimizedSize);
                totalOrigBytesForCompleted += f.originalSize;
            });

            const percent = roundTo((totalSavedBytes / totalOrigBytesForCompleted) * 100, 1);
            totalSavingPercent.textContent = percent >= 0 ? `${percent}%` : `0%`;
            downloadAllBtn.disabled = false;
        } else {
            totalSavingPercent.textContent = '0%';
            downloadAllBtn.disabled = true;
        }
    }

    // Download All ZIP logic
    downloadAllBtn.addEventListener('click', () => {
        const completed = filesQueue.filter(f => f.status === 'success');
        if (completed.length === 0) return;

        downloadAllBtn.disabled = true;
        downloadAllBtn.innerHTML = `
            <span class="spinner-icon" style="margin-right: 5px; display: inline-block;"></span>
            Packaging ZIP...
        `;

        const zipPayload = {
            files: completed.map(f => ({
                name: f.optimizedName,
                data: f.webpUrl
            }))
        };

        fetch('/api/download-zip/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(zipPayload)
        })
        .then(response => {
            if (!response.ok) throw new Error('ZIP generation failed');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'optimized_webp_images.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        })
        .catch(err => {
            alert('Could not download ZIP file. Please try downloading files individually.');
        })
        .finally(() => {
            downloadAllBtn.disabled = false;
            downloadAllBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download All (ZIP)
            `;
        });
    });

    // Clear all files
    clearBtn.addEventListener('click', () => {
        filesQueue = [];
        filesGrid.innerHTML = '';
        updateTotals();
        resultsSection.classList.add('hidden');
    });

    // Interactive Slider Split modal
    function openCompareModal(item) {
        compareFilename.textContent = item.file.name;
        compareBeforeImg.src = item.originalUrl;
        compareAfterImg.src = item.webpUrl;

        // Set comparison stats
        compareOrigSize.textContent = formatBytes(item.originalSize);
        compareWebpSize.textContent = formatBytes(item.optimizedSize);
        compareSaving.textContent = item.savingsPercent >= 0 ? `-${item.savingsPercent}%` : `+${Math.abs(item.savingsPercent)}%`;

        // Reset split position to 50%
        sliderRangeControl.value = 50;
        comparisonContainer.style.setProperty('--split-percent', '50%');

        compareModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock background scrolling
    }

    function closeCompareModal() {
        compareModal.classList.add('hidden');
        document.body.style.overflow = '';
        compareBeforeImg.src = '';
        compareAfterImg.src = '';
    }

    // Modal range slider input tracker
    sliderRangeControl.addEventListener('input', (e) => {
        const val = e.target.value;
        comparisonContainer.style.setProperty('--split-percent', `${val}%`);
    });

    closeModal.addEventListener('click', closeCompareModal);
    
    // Close modal when clicking backdrop area
    document.querySelector('.modal-backdrop').addEventListener('click', closeCompareModal);

    // Keyboard accessibility for modal closing
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !compareModal.classList.contains('hidden')) {
            closeCompareModal();
        }
    });

    // Helper functions
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function roundTo(num, decimals) {
        const t = Math.pow(10, decimals);
        return Math.round(num * t) / t;
    }
});
