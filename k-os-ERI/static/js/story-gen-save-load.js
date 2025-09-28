// This script assumes it's loaded after the main story-gen HTML and its inline script.
// It relies on the global `state`, `renderAll`, and `showToast` functions being available.
(function() {
    // Wait for the main app to be initialized
    if (typeof window.storyGenAppInitialized === 'undefined') {
        window.addEventListener('storyGenAppReady', initializeSaveLoad);
    } else {
        initializeSaveLoad();
    }

    function initializeSaveLoad() {
        const API_BASE = 'http://localhost:3001';
        const saveBtn = document.getElementById('storyGenSaveBtn');
        const loadBtn = document.getElementById('storyGenLoadBtn');
        const saveIdInput = document.getElementById('storyGenSaveIdInput');
        const loadModal = document.getElementById('storyGenLoadModal');
        const loadList = document.getElementById('storyGenLoadList');

        if (!saveBtn || !loadBtn || !saveIdInput || !loadModal || !loadList) {
            console.error('Save/Load UI elements not found. Make sure they are in the HTML.');
            return;
        }

        async function handleSave() {
            const saveId = saveIdInput.value.trim();
            if (!saveId) {
                alert('Please enter a unique Save ID.');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            try {
                // The global 'state' object is defined in the inline script of story-gen.yaml
                const payload = { saveId, scenes: window.storyGenState.scenes };
                const response = await fetch(`${API_BASE}/api/story-gen/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(errData.error);
                }

                const result = await response.json();
                window.showToast(result.message || 'Story saved successfully!');
                saveIdInput.value = ''; // Clear input on success
            } catch (error) {
                console.error('Save failed:', error);
                window.showToast(`Save failed: ${error.message}`);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        }

        function openLoadModal() {
            loadModal.hidden = false;
        }

        function closeLoadModal() {
            loadModal.hidden = true;
        }

        async function handleLoad() {
            try {
                loadBtn.disabled = true;
                const response = await fetch(`${API_BASE}/api/story-gen/list`);
                if (!response.ok) throw new Error('Could not fetch save list.');

                const saveIds = await response.json();
                loadList.innerHTML = ''; // Clear previous list

                if (saveIds.length === 0) {
                    loadList.innerHTML = '<p style="color: #64748b; text-align: center;">No saved stories found.</p>';
                } else {
                    saveIds.forEach(id => {
                        const item = document.createElement('button');
                        item.className = 'story-gen__button';
                        item.textContent = id;
                        item.style.width = '100%';
                        item.style.textAlign = 'left';
                        item.addEventListener('click', () => loadStory(id));
                        loadList.appendChild(item);
                    });
                }
                openLoadModal();
            } catch (error) {
                console.error('Load failed:', error);
                window.showToast(`Error: ${error.message}`);
            } finally {
                loadBtn.disabled = false;
            }
        }

        async function loadStory(saveId) {
            try {
                const response = await fetch(`${API_BASE}/api/story-gen/load/${saveId}`);
                if (!response.ok) throw new Error(`Failed to load story '${saveId}'.`);

                const loadedScenes = await response.json();
                window.storyGenState.scenes = loadedScenes;
                window.storyGenState.selectedSceneId = null;

                const projectMeta = document.getElementById('storyGenProject');
                if (projectMeta) projectMeta.textContent = `プロジェクト: ${saveId}`;

                window.renderAll();
                closeLoadModal();
                window.showToast(`Story '${saveId}' loaded successfully.`);
            } catch (error) {
                console.error('Failed to load story:', error);
                window.showToast(error.message);
            }
        }

        saveBtn.addEventListener('click', handleSave);
        loadBtn.addEventListener('click', handleLoad);
        loadModal.addEventListener('click', e => (e.target === loadModal || e.target.dataset.action === 'close-load-modal') && closeLoadModal());
    }
})();
