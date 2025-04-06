document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.querySelector('.app-container');
    const sidebarLinks = document.querySelectorAll('.nav-link');
    const phaseSections = document.querySelectorAll('.phase-section');
    const allInputs = document.querySelectorAll('.content-area input[type="text"], .content-area input[type="url"], .content-area textarea');
    const allCheckboxes = document.querySelectorAll('.step-checkbox');
    const tipToggleBtns = document.querySelectorAll('.tip-toggle-btn');
    const generatePdfBtn = document.getElementById('generate-pdf-btn');
    const generateHtmlBtn = document.getElementById('generate-html-btn');
    const clearDataBtn = document.getElementById('clear-data-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const importJsonBtn = document.getElementById('import-json-btn');
    const importFileInput = document.getElementById('import-file-input');
    const projectNameInput = document.getElementById('project-name');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    const saveIndicator = document.getElementById('save-indicator');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const storageHelpIcon = document.getElementById('storage-help-icon');
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const contentArea = document.getElementById('content-area');

    const { jsPDF } = window.jspdf;
    const { autoTable } = window.jspdf;
    const LS_PREFIX = 'premiumNavigator_V2_';
    const TIPS_STATE_KEY = '_tipVisible';
    const THEME_KEY = `${LS_PREFIX}themePreference`;
    let saveTimeout;
    let searchDebounceTimeout;
    let currentMarkInstance;
    let projectNameDebounceTimeout;

    function init() {
        loadThemePreference();
        loadInitialData();
        initializeTips();
        setupEventListeners();
        setActiveSection(window.location.hash ? window.location.hash.substring(1) : 'phase-1');
        if (typeof Mark !== 'undefined') {
            currentMarkInstance = new Mark(contentArea);
        } else {
            console.warn("Mark.js library not found. Search highlighting disabled.");
            if(searchInput) {
                searchInput.disabled = true;
                searchInput.placeholder = "Search unavailable";
            }
        }
    }

    function getSanitizedProjectName() {
        const projectName = projectNameInput.value.trim();
        return projectName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default_project';
    }

    function getProjectKeyPrefix() {
        return `${LS_PREFIX}${getSanitizedProjectName()}_`;
    }

    function getLocalStorageKey(elementId) {
        return `${getProjectKeyPrefix()}${elementId}`;
    }

    function showSaveIndicator() {
        clearTimeout(saveTimeout);
        if (saveIndicator) {
            saveIndicator.classList.add('visible');
            saveTimeout = setTimeout(() => {
                saveIndicator.classList.remove('visible');
            }, 1500);
        }
    }

    function saveData(element) {
        if (!element || !element.id) return;
        const key = getLocalStorageKey(element.id);
        let valueToSave = element.type === 'checkbox' ? element.checked : element.value;

        try {
            localStorage.setItem(key, JSON.stringify(valueToSave));
            showSaveIndicator();
        } catch (error) {
            console.error(`Error saving data for key "${key}":`, error);
            if (error.name === 'QuotaExceededError') {
                alert("⚠️ Could not save data. Browser storage might be full. Please export your data frequently using 'Export JSON'.");
            }
        }
    }

    function saveProjectName() {
        try {
            const currentProjectName = projectNameInput.value;
            localStorage.setItem(`${LS_PREFIX}projectName`, JSON.stringify(currentProjectName));
            showSaveIndicator();
        } catch (error) {
            console.error("Error saving project name:", error);
        }
    }

    function loadInitialData() {
        const savedProjectName = localStorage.getItem(`${LS_PREFIX}projectName`);
        if (savedProjectName && projectNameInput) {
            try {
                projectNameInput.value = JSON.parse(savedProjectName);
            } catch (e) { console.error("Error parsing saved project name:", e); }
        }
        loadAllElementData();
        updateProgress();
    }

    function loadAllElementData() {
         document.querySelectorAll('.content-area input[type="text"], .content-area input[type="url"], .content-area textarea, .step-checkbox')
            .forEach(element => {
                if (element.id !== 'project-name') {
                    loadElementState(element);
                }
             });
         initializeTips(true);
    }

    function loadElementState(element) {
         if (!element || !element.id) return;
         const key = getLocalStorageKey(element.id);
         const savedValueString = localStorage.getItem(key);

         if (savedValueString !== null) {
             try {
                 const savedValue = JSON.parse(savedValueString);
                 if (element.type === 'checkbox') element.checked = !!savedValue;
                 else element.value = savedValue || '';
             } catch (e) {
                 console.warn(`Error parsing LS key "${key}". Using raw value.`, e);
                 if (element.type !== 'checkbox') element.value = savedValueString || '';
                 else element.checked = savedValueString === 'true';
             }
         } else {
              if (element.type === 'checkbox') element.checked = false;
              else element.value = '';
         }
    }

    function updateProgress() {
        const currentCheckboxes = document.querySelectorAll('.step-checkbox');
        const totalSteps = currentCheckboxes.length;
        if (totalSteps === 0) {
            if(progressBarFill) progressBarFill.style.width = '0%';
            if(progressText) progressText.textContent = '0% Complete (0/0)';
            updatePhaseProgress();
            return;
        }

        let completedSteps = 0;
        currentCheckboxes.forEach(checkbox => {
            if (checkbox.checked) completedSteps++;
        });

        const percentage = Math.round((completedSteps / totalSteps) * 100);
       if(progressBarFill) progressBarFill.style.width = `${percentage}%`;
        if(progressText) progressText.textContent = `${percentage}% Complete (${completedSteps}/${totalSteps})`;
        updatePhaseProgress();
    }

    function updatePhaseProgress() {
        phaseSections.forEach(phase => {
            const phaseId = phase.id;
            const phaseCheckboxes = phase.querySelectorAll('.step-checkbox');
            const totalPhaseSteps = phaseCheckboxes.length;
            const progressSpan = document.getElementById(`${phaseId}-progress`);

            if (totalPhaseSteps === 0 || !progressSpan) return;

            let completedPhaseSteps = 0;
            phaseCheckboxes.forEach(checkbox => {
                if (checkbox.checked) completedPhaseSteps++;
            });

            const phasePercentage = Math.round((completedPhaseSteps / totalPhaseSteps) * 100);
            progressSpan.textContent = `${phasePercentage}%`;
            progressSpan.style.opacity = phasePercentage > 0 ? '1' : '0.5';
        });
    }

    function initializeTips(isReload = false) {
        tipToggleBtns.forEach(btn => {
            const tipTargetId = btn.getAttribute('data-tip-target');
            const tipContent = document.getElementById(tipTargetId);
            if (!tipContent) return;

            const storageKey = getLocalStorageKey(tipTargetId + TIPS_STATE_KEY);
            let isVisible = false;

            if (!isReload) {
                 try {
                     isVisible = JSON.parse(localStorage.getItem(storageKey) || 'false');
                 } catch (e) { console.error("Error parsing tip state:", e); }
                 tipContent.style.display = isVisible ? 'block' : 'none';
            } else {
                 isVisible = tipContent.style.display === 'block';
            }
            updateTipButtonIcon(btn, isVisible);

            if (!btn.hasClickListener) {
                btn.addEventListener('click', () => {
                    const currentlyVisible = tipContent.style.display === 'block';
                    const newState = !currentlyVisible;
                    tipContent.style.display = newState ? 'block' : 'none';
                    updateTipButtonIcon(btn, newState);
                    try {
                        localStorage.setItem(storageKey, JSON.stringify(newState));
                    } catch (e) { console.error("Error saving tip state:", e); }
                });
                btn.hasClickListener = true;
            }
        });
    }

     function updateTipButtonIcon(button, isVisible) {
         const icon = button.querySelector('i');
         if (icon) {
             icon.classList.remove('fa-circle-info', 'fa-circle-xmark');
             icon.classList.add(isVisible ? 'fa-circle-xmark' : 'fa-circle-info');
             button.setAttribute('title', isVisible ? 'Hide Tip' : 'Show Tip');
         }
     }

    function setActiveSection(phaseId) {
         if (!phaseId || !document.getElementById(phaseId)) {
             phaseId = 'phase-1';
         }
        phaseSections.forEach(section => {
            section.classList.toggle('active-section', section.id === phaseId);
        });
        sidebarLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-phase') === phaseId);
        });
         if (history.replaceState) {
             history.replaceState(null, null, `#${phaseId}`);
         } else {
             window.location.hash = phaseId;
         }
         const contentEl = document.querySelector('.content-area');
         if (contentEl) contentEl.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function clearAllFieldsAndState(keepProjectName = true) {
         document.querySelectorAll('.content-area input[type="text"], .content-area input[type="url"], .content-area textarea').forEach(input => {
             if(!keepProjectName || input.id !== 'project-name') input.value = '';
         });
         document.querySelectorAll('.step-checkbox').forEach(checkbox => checkbox.checked = false);
         document.querySelectorAll('.tip-content').forEach(tipDiv => {
            tipDiv.style.display = 'none';
            const tipButton = document.querySelector(`[data-tip-target="${tipDiv.id}"]`);
             if(tipButton) updateTipButtonIcon(tipButton, false);
         });
         if (!keepProjectName && projectNameInput) {
             projectNameInput.value = '';
         }
    }

    function setTheme(theme) {
        document.body.className = theme;
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) { console.error("Error saving theme preference:", e); }
    }

    function toggleTheme() {
        const currentTheme = document.body.classList.contains('dark-mode') ? 'dark-mode' : 'light-mode';
        const newTheme = currentTheme === 'light-mode' ? 'dark-mode' : 'light-mode';
        setTheme(newTheme);
    }

    function loadThemePreference() {
        try {
            const preferredTheme = localStorage.getItem(THEME_KEY) || 'light-mode';
            setTheme(preferredTheme);
        } catch (e) {
            console.error("Error loading theme preference:", e);
            setTheme('light-mode');
        }
    }

    function setupEventListeners() {
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const phaseId = link.getAttribute('data-phase');
                setActiveSection(phaseId);
            });
        });

        if (projectNameInput) {
            projectNameInput.addEventListener('input', () => {
                clearTimeout(projectNameDebounceTimeout);
                saveProjectName();
                projectNameDebounceTimeout = setTimeout(() => {
                    loadAllElementData();
                    updateProgress();
                    if (currentMarkInstance) {
                        currentMarkInstance.unmark();
                        if(searchInput) searchInput.value = '';
                        if(searchClearBtn) searchClearBtn.style.opacity = '0';
                    }
                }, 500);
            });
        }

        document.querySelectorAll('.content-area input[type="text"], .content-area input[type="url"], .content-area textarea').forEach(input => {
             if (input.id !== 'project-name') {
                 input.addEventListener('input', () => saveData(input));
             }
        });
        document.querySelectorAll('.step-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                saveData(checkbox);
                updateProgress();
            });
        });

        if (darkModeToggle) darkModeToggle.addEventListener('click', toggleTheme);
        if (generatePdfBtn) generatePdfBtn.addEventListener('click', generatePdfReport);
        if (generateHtmlBtn) generateHtmlBtn.addEventListener('click', generateHtmlReport);
        if (clearDataBtn) clearDataBtn.addEventListener('click', handleClearData);
        if (exportJsonBtn) exportJsonBtn.addEventListener('click', handleExportJson);
        if (importJsonBtn) importJsonBtn.addEventListener('click', () => importFileInput?.click());
        if (importFileInput) importFileInput.addEventListener('change', handleImportJson);

        if (storageHelpIcon) {
            storageHelpIcon.addEventListener('click', () => {
                alert("Your project data (notes, progress) is saved automatically in this browser's local storage under the current Project Title. It is NOT stored online.\n\nUse 'Export JSON' to create a backup file or to move your project to another browser/computer.\n\nChanging the Project Title effectively switches to a different local project.");
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchDebounceTimeout);
                const query = searchInput.value.trim();
                searchDebounceTimeout = setTimeout(() => {
                    handleSearch(query);
                }, 300);
                 if(searchClearBtn) searchClearBtn.style.opacity = query.length > 0 ? '0.7' : '0';
            });
        }
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                if(searchInput) searchInput.value = '';
                handleSearch('');
                searchClearBtn.style.opacity = '0';
            });
        }
        updateProgress();
    }

    function handleClearData() {
        const currentProjectName = projectNameInput ? projectNameInput.value.trim() : 'Default Project';
        if (!confirm(`⚠️ Are you sure you want to clear ALL data and progress for project "${currentProjectName}"? This cannot be undone.`)) {
            return;
        }

        const prefixToDelete = getProjectKeyPrefix();
        let keysToRemove = [];
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefixToDelete)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch(e) { console.error("Error clearing localStorage:", e); }

        clearAllFieldsAndState(true);
        updateProgress();
        alert(`Data for project "${currentProjectName}" cleared successfully.`);
    }

    function handleExportJson() {
        const projectName = projectNameInput ? projectNameInput.value.trim() : 'Untitled Project';
        const projectData = {
            projectName: projectName,
            _appVersion: 'PremiumNavV2',
            scopeNotes: document.getElementById('project-scope-notes')?.value || '',
            steps: {},
            tips: {},
            artifacts: {}
        };

        document.querySelectorAll('.content-area input[type="text"], .content-area input[type="url"], .content-area textarea').forEach(input => {
             if (input.id !== 'project-name' && input.id !== 'project-scope-notes') {
                if (input.closest('.step')) projectData.steps[input.id] = input.value;
            }
        });
         if (document.getElementById('project-scope-notes')) projectData.scopeNotes = document.getElementById('project-scope-notes').value;

         phaseSections.forEach(phase => {
            const summaryTextarea = phase.querySelector(`#${phase.id}-artifacts`);
            if (summaryTextarea) projectData.artifacts[summaryTextarea.id] = summaryTextarea.value;
         });

        document.querySelectorAll('.step-checkbox').forEach(checkbox => {
            projectData.steps[checkbox.id] = checkbox.checked;
        });
        document.querySelectorAll('.tip-content').forEach(tipDiv => {
             projectData.tips[tipDiv.id] = tipDiv.style.display === 'block';
        });

        try {
            const dataStr = JSON.stringify(projectData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const linkElement = document.createElement('a');
            linkElement.href = url;
            linkElement.download = `${getSanitizedProjectName()}_UIUX_Data.json`;
            document.body.appendChild(linkElement);
            linkElement.click();
            document.body.removeChild(linkElement);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error exporting JSON:", error);
            alert("Failed to export data. See console for details.");
        }
    }

     function handleImportJson(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);

                if (!importedData || typeof importedData.projectName === 'undefined' || (typeof importedData.steps !== 'object' && typeof importedData.artifacts !== 'object')) {
                    throw new Error("Invalid JSON file structure. Missing 'projectName' or 'steps'/'artifacts'.");
                }
                if (!confirm(`Import data for project "${importedData.projectName}"? This will overwrite current unsaved changes on the page.`)) {
                     event.target.value = null; return;
                }

                clearAllFieldsAndState(false);

                if(projectNameInput) {
                    projectNameInput.value = importedData.projectName || 'Untitled Imported Project';
                    saveProjectName();
                }

                const scopeNotesEl = document.getElementById('project-scope-notes');
                if (scopeNotesEl && importedData.scopeNotes) {
                    scopeNotesEl.value = importedData.scopeNotes;
                    saveData(scopeNotesEl);
                }

                Object.keys(importedData.steps || {}).forEach(elementId => {
                    const element = document.getElementById(elementId);
                    if (element) {
                        const value = importedData.steps[elementId];
                        if (element.type === 'checkbox') element.checked = !!value;
                        else element.value = value || '';
                        saveData(element);
                    } else console.warn(`Element ID "${elementId}" not found during step import.`);
                });

                 Object.keys(importedData.artifacts || {}).forEach(elementId => {
                     const element = document.getElementById(elementId);
                      if (element && element.tagName === 'TEXTAREA') {
                          element.value = importedData.artifacts[elementId] || '';
                          saveData(element);
                      } else console.warn(`Artifact textarea ID "${elementId}" not found during import.`);
                 });

                Object.keys(importedData.tips || {}).forEach(tipId => {
                     const tipContent = document.getElementById(tipId);
                     const tipButton = document.querySelector(`[data-tip-target="${tipId}"]`);
                     if (tipContent && tipButton) {
                         const isVisible = !!importedData.tips[tipId];
                         tipContent.style.display = isVisible ? 'block' : 'none';
                         updateTipButtonIcon(tipButton, isVisible);
                         try { localStorage.setItem(getLocalStorageKey(tipId + TIPS_STATE_KEY), JSON.stringify(isVisible)); } catch(err) { console.error("err saving imported tip state", err);}
                     } else console.warn(`Tip elements for ID "${tipId}" not found during import.`);
                });

                alert(`Project "${importedData.projectName}" imported successfully!`);
                updateProgress();

            } catch (error) {
                console.error("Error importing JSON:", error);
                alert(`Import failed: ${error.message}. Please ensure the file is valid JSON.`);
            } finally {
                 event.target.value = null;
            }
        };
        reader.onerror = (error) => {
             alert("Error reading file."); console.error("File reading error:", error); event.target.value = null;
        };
        reader.readAsText(file);
    }

     function handleSearch(query) {
        if (!currentMarkInstance) return;
        currentMarkInstance.unmark({
             done: () => {
                 if (query.length < 2) return;
                 currentMarkInstance.mark(query, {
                     element: 'mark',
                     className: 'search-highlight',
                     separateWordSearch: true,
                     done: (counter) => { console.log(`Found ${counter} matches for "${query}"`); }
                 });
             }
        });
    }

    function generatePdfReport() {
        const projectName = projectNameInput ? projectNameInput.value.trim() : 'Untitled Project';
        if (!projectName) {
            alert("Please enter a Project Title before generating a report.");
            projectNameInput?.focus();
            return;
        }
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;
        const margin = 15;
        const contentWidth = pageWidth - margin * 2;
        let yPos = margin;
        const primaryColor = '#14b8a6';
        const textColor = '#1a202c';
        const lightTextColor = '#6c757d';
        const linkColor = '#0d9488';
        const headingFontSize = 16;
        const subHeadingFontSize = 12;
        const bodyFontSize = 10;
        const labelFontSize = 9;
        const lineSpacing = 4.5;
        const checkMark = '✓';
        const emptyCircle = '○';

        doc.setFont('helvetica', 'normal');

        function checkNewPage(requiredHeight = 10) {
            if (yPos + requiredHeight >= pageHeight - margin) {
                addPageNumber();
                doc.addPage();
                yPos = margin;
            }
        }

         function addPageNumber() {
            const pageNum = doc.internal.getNumberOfPages();
             doc.setFontSize(8);
             doc.setTextColor(150);
             doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 10, { align: 'right'});
             doc.text(`Project: ${projectName}`, margin, pageHeight - 10);
             doc.setTextColor(textColor);
         }

         function addCoverPage() {
             checkNewPage(60);
             doc.setFontSize(22);
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(primaryColor);
             doc.text('UI/UX Process Report', pageWidth / 2, yPos + 15, { align: 'center' });
             yPos += 15;
             doc.setFontSize(18);
             doc.setFont('helvetica', 'normal');
             doc.setTextColor(textColor);
             doc.text(projectName, pageWidth / 2, yPos + 10, { align: 'center' });
             yPos += 15;
             doc.setFontSize(10);
             doc.setTextColor(lightTextColor);
             doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPos + 5, { align: 'center' });
             yPos += 15;

             const progressFill = document.getElementById('progress-bar-fill');
             const progressTxt = document.getElementById('progress-text');
             if (progressFill && progressTxt) {
                 doc.setFontSize(11);
                 doc.setFont('helvetica', 'bold');
                 doc.setTextColor(textColor);
                 doc.text(`Overall Progress: ${progressTxt.textContent}`, margin, yPos);
                 yPos += 6;
                 const barWidth = contentWidth * 0.6;
                 const barX = margin;
                 const barY = yPos;
                 const barHeight = 5;
                 const progressPercent = parseFloat(progressFill.style.width || '0') / 100;
                 doc.setFillColor(226, 232, 240);
                 doc.rect(barX, barY, barWidth, barHeight, 'F');
                 doc.setFillColor(primaryColor);
                 doc.rect(barX, barY, barWidth * progressPercent, barHeight, 'F');
                 yPos += barHeight + 10;
             }

             doc.setDrawColor(primaryColor);
             doc.setLineWidth(0.3);
             doc.line(margin, yPos, pageWidth - margin, yPos);
             yPos += 10;
             doc.setFont('helvetica', 'normal');
         }

        function addPhaseTitle(titleText) {
            checkNewPage(15);
            doc.setFontSize(headingFontSize);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(primaryColor);
             const cleanTitle = titleText.replace(/^[0-9]+\.\s*/, '').trim();
            doc.text(cleanTitle, margin, yPos + 5);
            yPos += lineSpacing * 2.5;
            doc.setTextColor(textColor);
            doc.setFont('helvetica', 'normal');
        }

        function renderStepContent(stepElement, stepTitle, isChecked) {
             doc.setFontSize(subHeadingFontSize);
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(textColor);
             const checkSymbol = isChecked ? checkMark : emptyCircle;
             const optionalTag = stepElement.dataset.optional === "true" ? " (Optional)" : "";
             const titleWithCheck = `${checkSymbol} ${stepTitle}${optionalTag}`;
             const titleLines = doc.splitTextToSize(titleWithCheck, contentWidth);
             checkNewPage(titleLines.length * lineSpacing * 1.2);
             doc.text(titleLines, margin, yPos);
             yPos += titleLines.length * lineSpacing * 1.2;
             doc.setFont('helvetica', 'normal');

             const inputs = stepElement.querySelectorAll('.input-group textarea, .input-group input[type="text"], .input-group input[type="url"]');
             let contentRenderedInStep = false;
             inputs.forEach(input => {
                 const labelElement = input.previousElementSibling;
                 const label = labelElement && labelElement.tagName === 'LABEL' ? labelElement.innerText.trim().replace(':', '') : '';
                 const value = input.value.trim();
                 const isUrl = input.type === 'url';

                 if (value) {
                     contentRenderedInStep = true;
                     checkNewPage(6);
                     doc.setFontSize(labelFontSize);
                     doc.setFont('helvetica', 'bold');
                     doc.setTextColor(lightTextColor);
                     doc.text(label + ":", margin + 4, yPos);
                     yPos += lineSpacing * 0.9;

                     checkNewPage(5);
                     doc.setFontSize(bodyFontSize);
                     doc.setFont('helvetica', 'normal');
                     const textOptions = {};
                     if (isUrl) {
                         doc.setTextColor(linkColor);
                         textOptions.url = value.startsWith('http') ? value : 'https://' + value;
                     } else {
                          doc.setTextColor(textColor);
                     }
                     const splitValue = doc.splitTextToSize(value, contentWidth - 4);
                     const requiredHeight = splitValue.length * lineSpacing;
                     checkNewPage(requiredHeight);

                     doc.textWithLink(splitValue[0], margin + 4, yPos, textOptions);
                      if(splitValue.length > 1){
                          doc.setTextColor(isUrl ? linkColor : textColor);
                          doc.text(splitValue.slice(1), margin + 4, yPos + lineSpacing);
                      }
                     yPos += requiredHeight + (lineSpacing * 0.6);
                     if (isUrl) doc.setTextColor(textColor);
                 }
             });
             if (contentRenderedInStep) yPos += lineSpacing * 0.8;
             return true;
         }

         function addPhaseArtifacts(phaseId) {
             const summaryTextarea = document.getElementById(`${phaseId}-artifacts`);
             if (summaryTextarea && summaryTextarea.value.trim()) {
                 const value = summaryTextarea.value.trim();
                 checkNewPage(15);
                 doc.setFontSize(labelFontSize);
                 doc.setFont('helvetica', 'bold');
                 doc.setTextColor(lightTextColor);
                 doc.text("Key Artifacts/Links for Phase:", margin, yPos);
                 yPos += lineSpacing * 0.9;

                 doc.setFontSize(bodyFontSize);
                 doc.setFont('helvetica', 'normal');
                 doc.setTextColor(textColor);
                 const splitValue = doc.splitTextToSize(value, contentWidth);
                 const requiredHeight = splitValue.length * lineSpacing;
                 checkNewPage(requiredHeight);
                 doc.text(splitValue, margin, yPos);
                 yPos += requiredHeight + (lineSpacing * 1.5);
             }
         }

        try {
            addCoverPage();
            phaseSections.forEach(section => {
                const phaseId = section.id;
                const phaseTitle = section.querySelector('.phase-title')?.innerText || `Phase ${phaseId.slice(-1)}`;
                const steps = section.querySelectorAll('.step');
                let phaseHasRenderedContent = false;
                 let shouldRenderPhase = false;

                 steps.forEach(step => {
                     const stepId = step.dataset.stepId;
                     const checkbox = document.getElementById(`step-${stepId}-check`);
                     const isChecked = checkbox ? checkbox.checked : false;
                     let stepHasContent = false;
                     step.querySelectorAll('.input-group textarea, .input-group input[type="text"], .input-group input[type="url"]').forEach(input => {
                        if (input.value.trim()) stepHasContent = true;
                     });
                     if (isChecked || stepHasContent) shouldRenderPhase = true;
                 });
                 const summaryTextarea = document.getElementById(`${phaseId}-artifacts`);
                 if (summaryTextarea && summaryTextarea.value.trim()) shouldRenderPhase = true;

                if (shouldRenderPhase) {
                    checkNewPage(20);
                    addPhaseTitle(phaseTitle);
                    steps.forEach(step => {
                        const stepId = step.dataset.stepId;
                        const checkbox = document.getElementById(`step-${stepId}-check`);
                        const isChecked = checkbox ? checkbox.checked : false;
                        let stepHasContent = false;
                        step.querySelectorAll('.input-group textarea, .input-group input[type="text"], .input-group input[type="url"]').forEach(input => {
                            if (input.value.trim()) stepHasContent = true;
                        });
                        if (isChecked || stepHasContent) {
                            if (renderStepContent(step, step.dataset.stepTitle, isChecked)) {
                                phaseHasRenderedContent = true;
                            }
                        }
                    });
                     addPhaseArtifacts(phaseId);
                     if (phaseHasRenderedContent) yPos += lineSpacing;
                }
            });

             const pageCount = doc.internal.getNumberOfPages();
             for (let i = 1; i <= pageCount; i++) {
                 doc.setPage(i);
                 addPageNumber();
             }

            doc.save(`${getSanitizedProjectName()}_UIUX_Report_${new Date().toISOString().slice(0,10)}.pdf`);

        } catch(error) {
            console.error("Error during PDF generation:", error);
            alert("An error occurred generating the PDF. Please check console for details.");
        }
    }

    function generateHtmlReport() {
        const projectName = projectNameInput ? projectNameInput.value.trim() : 'Untitled Project';
         if (!projectName) {
            alert("Please enter a Project Title before generating a report.");
            projectNameInput?.focus();
            return;
        }
        const currentThemeClass = document.body.className || 'light-mode';
        const cssRootVariables = getComputedStyle(document.documentElement);
        const cssVariables = {};
        const themePrefix = currentThemeClass === 'dark-mode' ? '--' : '--'; // Use same prefix for simplicity here, just copy all relevant ones
        const relevantVars = ['font-main', 'bg-main', 'bg-content', 'text-primary', 'text-secondary', 'text-light', 'accent-primary', 'accent-secondary', 'border-color', 'border-radius-medium', 'border-radius-large', 'highlight-bg'];

         relevantVars.forEach(varName => {
             cssVariables[varName] = cssRootVariables.getPropertyValue(`--${varName.replace(/-/g,'-')}`).trim();
         });

        let inlineCss = `
            :root { ${Object.entries(cssVariables).map(([key, value]) => `${key}: ${value};`).join('\n')} }
            body { font-family: var(--font-main); background-color: var(--bg-main); color: var(--text-primary); line-height: 1.6; padding: 20px; margin: 0; }
            .report-container { max-width: 900px; margin: 20px auto; background-color: var(--bg-content); padding: 30px 40px; border-radius: var(--border-radius-large); border: 1px solid var(--border-color); box-shadow: 0 5px 20px rgba(0,0,0,0.08); }
            h1 { color: var(--accent-primary); text-align: center; margin-bottom: 10px; font-size: 1.8em; font-weight: 700; }
            h2 { text-align: center; color: var(--text-primary); margin-bottom: 20px; font-size: 1.4em; font-weight: 600; }
            .report-meta { text-align: center; color: var(--text-light); font-size: 0.9em; margin-bottom: 30px; }
            .phase-block { margin-bottom: 40px; }
            .phase-title { font-size: 1.5em; font-weight: 700; color: var(--accent-primary); margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); }
            .step-block { margin-bottom: 25px; padding-left: 10px; }
            .step-title { font-size: 1.15em; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
            .step-title .check { margin-right: 8px; font-weight: bold; display: inline-block; width: 1.2em; text-align: center; }
            .step-title .optional-tag { font-style: italic; color: var(--text-light); font-weight: 400; font-size: 0.9em; margin-left: 5px;}
            .step-content { margin-left: 25px; }
            .step-content .input-item { margin-bottom: 10px; }
            .step-content .input-label { display: block; font-size: 0.9em; font-weight: 600; color: var(--text-secondary); margin-bottom: 3px; }
            .step-content .input-value { font-size: 0.95em; color: var(--text-primary); white-space: pre-wrap; word-wrap: break-word; }
            .step-content .input-value a { color: var(--accent-primary); text-decoration: underline; word-break: break-all; }
            .phase-summary { margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border-color); margin-left: -10px; } /* Align with phase title */
            .phase-summary .step-title { font-size: 1.05em; color: var(--text-secondary); }
        `;

        let reportHtml = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(projectName)} - UI/UX Report</title><style>${inlineCss}</style></head>
<body><div class="report-container">
<h1>UI/UX Process Report</h1><h2>${escapeHtml(projectName)}</h2>
<p class="report-meta">Generated on: ${new Date().toLocaleDateString()}</p>`;

        const scopeNotes = document.getElementById('project-scope-notes')?.value.trim();
        if (scopeNotes) {
             reportHtml += `<div class="phase-block"><h3 class="phase-title" style="color: var(--accent-secondary);">Project Scope & Methodology</h3><div class="step-block"><div class="step-content"><div class="input-item"><span class="input-value">${escapeHtml(scopeNotes)}</span></div></div></div></div>`;
        }

        phaseSections.forEach(section => {
            let phaseHtml = '';
            const phaseTitle = section.querySelector('.phase-title')?.innerText || '';
            const steps = section.querySelectorAll('.step');
            let stepsAddedToPhase = 0;

            steps.forEach(step => {
                const stepId = step.dataset.stepId;
                const stepTitle = step.dataset.stepTitle;
                const checkbox = document.getElementById(`step-${stepId}-check`);
                const isChecked = checkbox ? checkbox.checked : false;
                const isOptional = step.dataset.optional === "true";
                let stepContentHtml = '';
                let stepHasContent = false;

                step.querySelectorAll('.input-group textarea, .input-group input[type="text"], .input-group input[type="url"]').forEach(input => {
                    const labelElement = input.previousElementSibling;
                    const label = labelElement && labelElement.tagName === 'LABEL' ? labelElement.innerText.trim().replace(':', '') : '';
                    const value = input.value.trim();
                    const isUrl = input.type === 'url';
                    if (value) {
                        stepHasContent = true;
                        stepContentHtml += `<div class="input-item"><span class="input-label">${escapeHtml(label)}:</span><span class="input-value">`;
                        if (isUrl) {
                             let url = value;
                             if (!url.match(/^https?:\/\//)) url = 'https://' + url;
                            stepContentHtml += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`;
                        } else {
                            stepContentHtml += escapeHtml(value);
                        }
                        stepContentHtml += `</span></div>`;
                    }
                });

                if (isChecked || stepHasContent) {
                    stepsAddedToPhase++;
                    phaseHtml += `<div class="step-block"><h4 class="step-title"><span class="check">${isChecked ? '✅' : '⬜️'}</span>${escapeHtml(stepTitle)}${isOptional ? '<span class="optional-tag">(Optional)</span>' : ''}</h4>${stepContentHtml ? `<div class="step-content">${stepContentHtml}</div>` : ''}</div>`;
                }
            });

             const summaryTextarea = document.getElementById(`${section.id}-artifacts`);
             const summaryValue = summaryTextarea ? summaryTextarea.value.trim() : '';
             if (summaryValue) {
                 stepsAddedToPhase++;
                 phaseHtml += `<div class="step-block phase-summary"><h4 class="step-title"><span class="check">📄</span>Key Artifacts/Links for Phase</h4><div class="step-content"><div class="input-item"><span class="input-value">${escapeHtml(summaryValue)}</span></div></div></div>`;
             }

            if (stepsAddedToPhase > 0) {
                reportHtml += `<div class="phase-block"><h3 class="phase-title">${escapeHtml(phaseTitle)}</h3>${phaseHtml}</div>`;
            }
        });

        reportHtml += `</div></body></html>`;

        try {
            const dataBlob = new Blob([reportHtml], { type: 'text/html' });
            const url = URL.createObjectURL(dataBlob);
            const linkElement = document.createElement('a');
            linkElement.href = url;
            linkElement.download = `${getSanitizedProjectName()}_UIUX_Report.html`;
            document.body.appendChild(linkElement);
            linkElement.click();
            document.body.removeChild(linkElement);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error generating HTML report:", error);
            alert("Failed to generate HTML report. See console for details.");
        }
    }

     function escapeHtml(unsafe) {
         if (typeof unsafe !== 'string') return '';
         return unsafe
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
     }

    init();

});