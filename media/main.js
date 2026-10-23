(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    let currentPath = '';
    let historyStack = [];
    let historyIndex = -1;
    let requestCounter = 0;
    const pendingResources = new Map();
    const PLACEHOLDER_IMAGE =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    // TOC tree building
    function buildTocTree(entries, container) {
        const sorted = [...entries].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        sorted.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'toc-item';

            const row = document.createElement('div');
            row.className = 'toc-item-row';

            const hasChildren = entry.children && entry.children.length > 0;
            const toggle = document.createElement('div');
            toggle.className = 'toc-toggle' + (hasChildren ? '' : ' empty');
            toggle.textContent = hasChildren ? '▸' : '';

            const label = document.createElement('div');
            label.className = 'toc-item-label';
            label.textContent = entry.name;
            label.title = entry.name;

            row.appendChild(toggle);
            row.appendChild(label);

            let childrenContainer = null;
            if (hasChildren) {
                childrenContainer = document.createElement('div');
                childrenContainer.className = 'toc-children collapsed';

                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isCollapsed = childrenContainer.classList.contains('collapsed');
                    if (isCollapsed) {
                        childrenContainer.classList.remove('collapsed');
                        toggle.textContent = '▾';
                    } else {
                        childrenContainer.classList.add('collapsed');
                        toggle.textContent = '▸';
                    }
                });

                buildTocTree(entry.children, childrenContainer);
            }

            row.addEventListener('click', () => {
                if (entry.local) {
                    navigateTo(entry.local);
                }
            });

            item.appendChild(row);
            if (childrenContainer) {
                item.appendChild(childrenContainer);
            }
            container.appendChild(item);
        });
    }

    // Collect TOC entries matching the search term into a flat list.
    // Unlike buildTocTree, matching children are shown as top-level rows.
    function filterTocFlat(entries, searchTerm) {
        const lower = searchTerm.toLowerCase();
        const matches = [];
        entries.forEach((entry) => {
            if (entry.name.toLowerCase().includes(lower)) {
                matches.push({ name: entry.name, local: entry.local });
            }
            if (entry.children) {
                matches.push(...filterTocFlat(entry.children, searchTerm));
            }
        });
        return matches;
    }

    function buildFlatList(entries, container) {
        entries.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'toc-item-row';

            const label = document.createElement('div');
            label.className = 'toc-item-label';
            label.textContent = entry.name;
            label.title = entry.name;

            row.appendChild(label);
            row.addEventListener('click', () => {
                if (entry.local) {
                    navigateTo(entry.local);
                }
            });
            container.appendChild(row);
        });
    }

    // Handle TOC search as a flat list with result count and clear button
    let searchTimeout;
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const searchResults = document.getElementById('search-results');

    function updateSearchUI() {
        const hasValue = searchInput.value.length > 0;
        searchClear.classList.toggle('hidden', !hasValue);
        searchResults.classList.toggle('hidden', !hasValue);
    }

    function renderToc() {
        const searchTerm = searchInput.value.trim();
        const treeContainer = document.getElementById('toc-tree');
        treeContainer.innerHTML = '';

        if (searchTerm) {
            const matches = filterTocFlat(window.CHM_DATA.toc, searchTerm);
            matches.sort((a, b) =>
                a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            );
            buildFlatList(matches, treeContainer);
            searchResults.textContent =
                matches.length === 1 ? '1 topic' : matches.length + ' topics';
        } else {
            buildTocTree(window.CHM_DATA.toc, treeContainer);
        }
        updateSearchUI();
    }

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(renderToc, 200);
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
        renderToc();
    });

    function navigateTo(path) {
        // Strip fragment for history tracking
        const basePath = path.split('#')[0].split('?')[0];

        // Add to history
        if (historyIndex < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyIndex + 1);
        }
        historyStack.push(basePath);
        historyIndex = historyStack.length - 1;

        currentPath = path;
        updateNavigationButtons();
        showLoading();
        requestCounter++;
        vscode.postMessage({ type: 'getHtml', path: path, requestId: requestCounter });
        setLoadTimer(path);
    }

    function updateNavigationButtons() {
        const backBtn = document.getElementById('btn-back');
        const forwardBtn = document.getElementById('btn-forward');
        backBtn.disabled = historyIndex <= 0;
        forwardBtn.disabled = historyIndex >= historyStack.length - 1;
    }

    function showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('error').classList.add('hidden');
        document.getElementById('content-iframe').style.display = 'none';
    }

    const LOAD_TIMEOUT_MS = 15000;
    let loadTimer = null;

    function setLoadTimer(path) {
        if (loadTimer !== null) {
            clearTimeout(loadTimer);
        }
        loadTimer = setTimeout(() => {
            loadTimer = null;
            showError('Timed out loading: ' + path);
        }, LOAD_TIMEOUT_MS);
    }

    function clearLoadTimer() {
        if (loadTimer !== null) {
            clearTimeout(loadTimer);
            loadTimer = null;
        }
    }

    function showError(message) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('error').textContent = message;
        document.getElementById('content-iframe').style.display = 'none';
    }

    function showContent() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
        document.getElementById('content-iframe').style.display = 'block';
    }

    // Load HTML content into iframe. Returns false (after showing an error)
    // if the content frame cannot be written, so the caller can avoid
    // resolving the loading state.
    function loadHtmlIntoIframe(html, path) {
        try {
            const iframe = document.getElementById('content-iframe');
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (!iframeDoc) {
                throw new Error('content frame is not accessible');
            }
            iframeDoc.open();
            iframeDoc.write(html);
            iframeDoc.close();

            // Process all links to intercept navigation
            processLinks(iframeDoc, path);

            // Process all images to intercept and load from CHM
            processImages(iframeDoc, path);

            // Process stylesheets
            processStylesheets(iframeDoc, path);

            // Process scripts
            processScripts(iframeDoc, path);

            // Update current page label
            document.getElementById('current-page').textContent = path;
            return true;
        } catch (error) {
            const reason = error && error.message ? error.message : String(error);
            showError('Failed to load ' + path + ': ' + reason);
            return false;
        }
    }

    function processLinks(doc, basePath) {
        const links = doc.querySelectorAll('a[href]');
        links.forEach((link) => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('http') || href.startsWith('mailto:')) {
                return;
            }
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const resolvedPath = resolvePath(href, basePath);
                if (resolvedPath) {
                    navigateTo(resolvedPath);
                }
            });
        });
    }

    function processImages(doc, basePath) {
        const images = doc.querySelectorAll('img[src]');
        images.forEach((img) => {
            const src = img.getAttribute('src');
            if (!src || src.startsWith('http') || src.startsWith('data:')) {
                return;
            }
            const resolvedPath = resolvePath(src, basePath);
            if (resolvedPath) {
                vscode.postMessage({ type: 'getFile', path: resolvedPath });
                img.setAttribute('data-requested-path', resolvedPath);
                img.src = PLACEHOLDER_IMAGE;
            }
        });
    }

    function processStylesheets(doc, basePath) {
        const links = doc.querySelectorAll('link[rel="stylesheet"][href]');
        links.forEach((link) => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('http') || href.startsWith('data:')) {
                return;
            }
            const resolvedPath = resolvePath(href, basePath);
            if (resolvedPath) {
                vscode.postMessage({ type: 'getFile', path: resolvedPath });
                link.setAttribute('data-requested-path', resolvedPath);
            }
        });
    }

    function processScripts(doc, basePath) {
        const scripts = doc.querySelectorAll('script[src]');
        scripts.forEach((script) => {
            const src = script.getAttribute('src');
            if (!src || src.startsWith('http') || src.startsWith('data:')) {
                return;
            }
            const resolvedPath = resolvePath(src, basePath);
            if (resolvedPath) {
                vscode.postMessage({ type: 'getFile', path: resolvedPath });
                script.setAttribute('data-requested-path', resolvedPath);
            }
        });
    }

    function resolvePath(href, basePath) {
        // Remove fragment
        let path = href.split('#')[0].split('?')[0];
        if (!path) return href; // Only fragment

        // If already starts with /, use as is
        if (path.startsWith('/')) return path;

        // Resolve relative to base
        const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
        const resolved = baseDir + path;

        // Normalize (remove ./ and ../)
        const parts = resolved.split('/');
        const stack = [];
        for (const part of parts) {
            if (part === '.') continue;
            if (part === '') continue;
            if (part === '..') {
                stack.pop();
            } else {
                stack.push(part);
            }
        }
        return '/' + stack.join('/');
    }

    function updateTocSelection(path) {
        document.querySelectorAll('.toc-item-row.selected').forEach((el) => {
            el.classList.remove('selected');
        });

        const findAndSelect = (entries) => {
            for (const entry of entries) {
                if (entry.local === path) {
                    const rows = document.querySelectorAll('.toc-item-row');
                    for (const row of rows) {
                        if (row.textContent === entry.name) {
                            row.classList.add('selected');
                            row.scrollIntoView({ block: 'nearest' });
                            return true;
                        }
                    }
                }
                if (entry.children && findAndSelect(entry.children)) {
                    return true;
                }
            }
            return false;
        };

        findAndSelect(window.CHM_DATA.toc);
    }

    // Navigation buttons
    document.getElementById('btn-back').addEventListener('click', () => {
        if (historyIndex > 0) {
            historyIndex--;
            const path = historyStack[historyIndex];
            currentPath = path;
            updateNavigationButtons();
            showLoading();
            requestCounter++;
            vscode.postMessage({ type: 'getHtml', path: path, requestId: requestCounter });
            setLoadTimer(path);
        }
    });

    document.getElementById('btn-home').addEventListener('click', () => {
        navigateTo(window.CHM_DATA.defaultTopic || 'index.html');
    });

    document.getElementById('btn-forward').addEventListener('click', () => {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            const path = historyStack[historyIndex];
            currentPath = path;
            updateNavigationButtons();
            showLoading();
            requestCounter++;
            vscode.postMessage({ type: 'getHtml', path: path, requestId: requestCounter });
            setLoadTimer(path);
        }
    });

    // Handle messages from extension. Registered before the initial request so
    // the first reply can never be missed.
    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.type) {
            case 'htmlContent':
                clearLoadTimer();
                if (!message.html) {
                    showError('File not found: ' + message.path);
                } else {
                    if (loadHtmlIntoIframe(message.html, message.path)) {
                        showContent();
                        updateTocSelection(message.path.split('#')[0]);
                    }
                }
                break;
            case 'fileContent':
                handleFileContent(message);
                break;
            case 'fileNotFound':
                handleFileNotFound(message);
                break;
            case 'loadError':
                clearLoadTimer();
                showError(message.message || 'Failed to load: ' + (message.path || 'unknown path'));
                break;
        }
    });

    // Build initial TOC and request the default topic. Any setup failure must
    // surface as an error instead of leaving the loading indicator up forever.
    try {
        const tocTree = document.getElementById('toc-tree');
        buildTocTree(window.CHM_DATA.toc, tocTree);

        const defaultTopic = window.CHM_DATA.defaultTopic || 'index.html';
        navigateTo(defaultTopic);
    } catch (error) {
        const reason = error && error.message ? error.message : String(error);
        showError('Failed to start: ' + reason);
    }

    function handleFileContent(message) {
        const path = message.path;
        const data = message.data;
        const mimeType = message.mimeType || 'application/octet-stream';
        const dataUrl = 'data:' + mimeType + ';base64,' + data;
        let textContent;
        const getTextContent = () => {
            if (textContent === undefined) {
                textContent = base64ToText(data);
            }
            return textContent;
        };

        const iframe = document.getElementById('content-iframe');
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

        // Update images
        iframeDoc
            .querySelectorAll('img[data-requested-path]')
            .forEach((img) => {
                if (img.getAttribute('data-requested-path') === path) {
                    img.src = dataUrl;
                }
            });

        // Update stylesheets
        iframeDoc
            .querySelectorAll('link[data-requested-path]')
            .forEach((link) => {
                if (link.getAttribute('data-requested-path') === path) {
                    const style = iframeDoc.createElement('style');
                    style.textContent = getTextContent();
                    link.parentNode.replaceChild(style, link);
                }
            });

        // Update scripts
        iframeDoc
            .querySelectorAll('script[data-requested-path]')
            .forEach((script) => {
                if (script.getAttribute('data-requested-path') === path) {
                    const newScript = iframeDoc.createElement('script');
                    newScript.textContent = getTextContent();
                    script.parentNode.replaceChild(newScript, script);
                }
            });
    }

    function handleFileNotFound(message) {
        const path = message.path;
        const iframe = document.getElementById('content-iframe');
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

        // Remove broken image references and show alt text
        iframeDoc
            .querySelectorAll('img[data-requested-path]')
            .forEach((img) => {
                if (img.getAttribute('data-requested-path') === path) {
                    if (img.alt) {
                        const text = iframeDoc.createTextNode(img.alt);
                        img.parentNode.replaceChild(text, img);
                    }
                }
            });

        // Remove broken stylesheet links
        iframeDoc
            .querySelectorAll('link[data-requested-path]')
            .forEach((link) => {
                if (link.getAttribute('data-requested-path') === path) {
                    link.remove();
                }
            });

        // Remove broken script references
        iframeDoc
            .querySelectorAll('script[data-requested-path]')
            .forEach((script) => {
                if (script.getAttribute('data-requested-path') === path) {
                    script.remove();
                }
            });

        // Show error for HTML pages
        if (path.endsWith('.html') || path.endsWith('.htm')) {
            showError('File not found: ' + path);
        }
    }

    function base64ToText(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    }
})();
