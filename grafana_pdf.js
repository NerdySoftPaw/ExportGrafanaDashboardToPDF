'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');

console.log("Script grafana_pdf.js started...");

const url = process.argv[2];
const auth_string = process.argv[3];
let outfile = process.argv[4];

const width_px = parseInt(process.env.PDF_WIDTH_PX, 10) || 1200;
console.log("PDF width set to:", width_px);

const auth_header = 'Basic ' + Buffer.from(auth_string).toString('base64');

(async () => {
    try {
        console.log("URL provided:", url);
        console.log("Checking URL accessibility...");
        const response = await fetch(url, {
            method: 'GET',
            headers: {'Authorization': auth_header}
        });

        if (!response.ok) {
            throw new Error(`Unable to access URL. HTTP status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) {
            throw new Error("The URL provided is not a valid Grafana instance.");
        }

        let finalUrl = url;
        if(process.env.FORCE_KIOSK_MODE === 'true') {
            console.log("Checking if kiosk mode is enabled.")
            if (!finalUrl.includes('&kiosk')) {
                console.log("Kiosk mode not enabled. Enabling it.")
                finalUrl += '&kiosk=true';
            }
            console.log("Kiosk mode enabled.")
        }

        console.log("Starting browser...");
        const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });

        const page = await browser.newPage();
        console.log("Browser started...");

        await page.setExtraHTTPHeaders({'Authorization': auth_header});
        await page.setDefaultNavigationTimeout(process.env.PUPPETEER_NAVIGATION_TIMEOUT || 120000);

        await page.setViewport({
            width: width_px,
            height: 800,
            deviceScaleFactor: 2,
            isMobile: false
        });

        console.log("Navigating to URL...");
        await page.goto(finalUrl, {waitUntil: 'networkidle0'});
        console.log("Page loaded...");

        page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                msg.args()[i].jsonValue().then(val => console.log(`[Browser console] ${msg.type()}:`, val));
        });

        let dashboardName = 'output_grafana';
        let date = new Date().toISOString().split('T')[0];
        let addRandomStr = false;

        if (process.env.EXTRACT_DATE_AND_DASHBOARD_NAME_FROM_HTML_PANEL_ELEMENTS === 'true') {
            console.log("Extracting dashboard name and date from the HTML page...");
            let scrapedDashboardName = await page.evaluate(() => {
                const dashboardElement = document.getElementById('display_actual_dashboard_title');
                return dashboardElement ? dashboardElement.innerText.trim() : null;
            });

            let scrapedDate = await page.evaluate(() => {
                const dateElement = document.getElementById('display_actual_date');
                return dateElement ? dateElement.innerText.trim() : null;
            });

            let scrapedPanelName = await page.evaluate(() => {
                const scrapedPanelName = document.querySelectorAll('h6');
                if (scrapedPanelName.length > 1) { // Multiple panels detected
                    console.log("Multiple panels detected. Unable to fetch a unique panel name. Using default value.")
                    return null;
                }
                if (scrapedPanelName[0] && scrapedPanelName[0].innerText.trim() === '') {
                    console.log("Empty panel name detected. Using default value.")
                    return null;
                }
                return scrapedPanelName[0] ? scrapedPanelName[0].innerText.trim() : null;
            });

            if (scrapedPanelName && !scrapedDashboardName) {
                console.log("Panel name fetched:", scrapedPanelName);
                dashboardName = scrapedPanelName;
                addRandomStr = false;
            } else if (!scrapedDashboardName) {
                console.log("Dashboard name not found. Using default value.");
                addRandomStr = true;
            } else {
                console.log("Dashboard name fetched:", scrapedDashboardName);
                dashboardName = scrapedDashboardName;
            }

            if (scrapedPanelName && !scrapedDate) {
                const urlParts = new URL(url);
                const from = urlParts.searchParams.get('from');
                const to = urlParts.searchParams.get('to');
                if (from && to) {
                    const fromDate = isNaN(from) ? from.replace(/[^\w\s-]/g, '_') : new Date(parseInt(from)).toISOString().split('T')[0];
                    const toDate = isNaN(to) ? to.replace(/[^\w\s-]/g, '_') : new Date(parseInt(to)).toISOString().split('T')[0];
                    date = `${fromDate}_to_${toDate}`;
                } else {
                    // using date in URL
                    date = new Date().toISOString().split('T')[0];
                }
            } else if (!scrapedDate) {
                console.log("Date not found. Using default value.");
            } else {
                console.log("Date fetched:", date);
                date = scrapedDate;
            }
        } else {
            console.log("Extracting dashboard name and date from the URL...");
            const urlParts = new URL(url);
            const pathSegments = urlParts.pathname.split('/');
            dashboardName = pathSegments[pathSegments.length - 1] || dashboardName;
            const from = urlParts.searchParams.get('from');
            const to = urlParts.searchParams.get('to');
            if (from && to) {
                const fromDate = isNaN(from) ? from.replace(/[^\w\s-]/g, '_') : new Date(parseInt(from)).toISOString().split('T')[0];
                const toDate = isNaN(to) ? to.replace(/[^\w\s-]/g, '_') : new Date(parseInt(to)).toISOString().split('T')[0];
                date = `${fromDate}_to_${toDate}`;
            } else {
                date = new Date().toISOString().split('T')[0];
            }
            console.log("Dashboard name fetched from URL:", dashboardName);
            console.log("Trying to fetch the panel name from the page...")
            let scrapedPanelName = await page.evaluate(() => {
                const scrapedPanelName = document.querySelectorAll('h6');
                console.log(scrapedPanelName)
                if (scrapedPanelName.length > 1) { // Multiple panels detected
                    console.log("Multiple panels detected. Unable to fetch a unique panel name. Using default value.")
                    return null;
                }
                if (scrapedPanelName[0] && scrapedPanelName[0].innerText.trim() === '') {
                    console.log("Empty panel name detected. Using default value.")
                    return null;
                }
                return scrapedPanelName[0] ? scrapedPanelName[0].innerText.trim() : null;
            });

            if (scrapedPanelName) {
                console.log("Panel name fetched:", scrapedPanelName);
                dashboardName = scrapedPanelName;
                addRandomStr = false;
            }

            console.log("Date fetched from URL:", date);
        }

        outfile = `./output/${dashboardName.replace(/\s+/g, '_')}_${date.replace(/\s+/g, '_')}${addRandomStr ? '_' + Math.random().toString(36).substring(7) : ''}.pdf`;

        const loginPageDetected = await page.evaluate(() => {
            const resetPasswordButton = document.querySelector('a[href*="reset-email"]');
            return !!resetPasswordButton;
        })

        if (loginPageDetected) {
            throw new Error("Login page detected. Check your credentials.");
        }

        // Debug panel count and status - improved for Grafana 12
        const panelCount = await page.evaluate(() => {
            const panelSelectors = [
                '[data-testid="panel"]',
                '.panel-container',
                '.react-grid-item',
                '.dashboard-panel'
            ];

            let counts = {};
            for (const selector of panelSelectors) {
                const elements = document.querySelectorAll(selector);
                counts[selector] = elements.length;
            }
            return counts;
        });
        console.log("Panel detection counts:", panelCount);

        if(process.env.DEBUG_MODE === 'true') {
            const documentHTML = await page.evaluate(() => {
                return document.querySelector("*").outerHTML;
            });
            if (!fs.existsSync('./debug')) {
                fs.mkdirSync('./debug');
            }
            const filename = `./debug/debug_${dashboardName.replace(/\s+/g, '_')}_${date.replace(/\s+/g, '_')}${'_' + Math.random().toString(36).substring(7)}.html`;
            fs.writeFileSync(filename, documentHTML);
            console.log("Debug HTML file saved at:", filename);

            // Enhanced debug information for panel visibility
            const panelInfo = await page.evaluate(() => {
                const allSelectors = [
                    '[data-testid="panel"]',
                    '.panel-container',
                    '.react-grid-item',
                    '.dashboard-panel'
                ];

                // Find which selector works for this Grafana version
                let panels = [];
                let usedSelector = '';

                for (const selector of allSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements && elements.length > 0) {
                        panels = Array.from(elements);
                        usedSelector = selector;
                        break;
                    }
                }

                return {
                    usedSelector,
                    panelCount: panels.length,
                    panels: panels.map((panel, index) => {
                        const rect = panel.getBoundingClientRect();
                        const style = window.getComputedStyle(panel);
                        return {
                            index,
                            visible: rect.width > 0 && rect.height > 0,
                            displayed: style.display !== 'none',
                            position: {
                                top: rect.top,
                                left: rect.left,
                                width: rect.width,
                                height: rect.height
                            },
                            computedStyle: {
                                display: style.display,
                                visibility: style.visibility,
                                opacity: style.opacity
                            }
                        };
                    })
                };
            });
            console.log("Panel detection details:", JSON.stringify(panelInfo, null, 2));
        }

        // IMPROVED: Enhanced panel detection and rendering for Grafana 12 compatibility
        console.log("Ensuring panels are properly rendered...");
        await page.evaluate(async () => {
            // Force all known panel types to be visible
            const panelSelectors = [
                '[data-testid="panel"]',
                '.panel-container',
                '.react-grid-item',
                '.dashboard-panel',
                '.grafana-dashboard-panel'
            ];

            for (const selector of panelSelectors) {
                const panels = document.querySelectorAll(selector);
                if (panels.length > 0) {
                    console.log(`Found ${panels.length} panels with selector ${selector}`);

                    // Make sure all panels are visible
                    Array.from(panels).forEach((panel, i) => {
                        panel.style.display = 'block';
                        panel.style.visibility = 'visible';
                        panel.style.opacity = '1';
                        console.log(`Ensured visibility of panel ${i+1}`);
                    });
                }
            }
        });

        async function expandCollapsedPanels(page) {
            const debugMode = process.env.DEBUG_MODE === 'true';
            if (debugMode) console.log('[DEBUG] Searching for collapsed panels/rows...');

            // Panel and row selectors for different Grafana versions
            const selectors = [
                '[data-testid="panel"][aria-expanded="false"]',
                '.panel-collapsed',
                '.row-collapsed',
                '.dashboard-row--collapsed',
                '.dashboard-row[aria-expanded="false"]',
                '.panel-title-container .fa-chevron-right',
                '.panel-title-container .fa-angle-right',
                '.panel-title-container .fa-caret-right',
                '.dashboard-row__title .fa-chevron-right',
                '.dashboard-row__title .fa-angle-right',
                '.dashboard-row__title .fa-caret-right',
                '.row-title-container .fa-chevron-right',
                '.row-title-container .fa-angle-right',
                '.row-title-container .fa-caret-right',
                'button[aria-label="Expand row"]'
            ];

            const expanded = await page.evaluate(async (selectors, debugMode) => {
                let expandedCount = 0;

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0 && debugMode) {
                        console.log(`[DEBUG] Found expandable elements for ${selector}: ${elements.length}`);
                    }

                    for (const el of elements) {
                        try {
                            // Try clicking on the expand icon
                            if (typeof el.click === 'function') {
                                el.click();
                                expandedCount++;
                                if (debugMode) console.log(`[DEBUG] Clicked on element: ${selector}`);
                            } else {
                                // Fallback: Try clicking on parent element
                                if (el.parentElement && typeof el.parentElement.click === 'function') {
                                    el.parentElement.click();
                                    expandedCount++;
                                    if (debugMode) console.log(`[DEBUG] Clicked on parent element: ${selector}`);
                                }
                            }
                        } catch (error) {
                            if (debugMode) console.log(`[DEBUG] Error clicking on ${selector}: ${error.message}`);
                        }
                    }
                }

                // Wait after clicks so content can load
                if (expandedCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000 + expandedCount * 500));
                }

                return expandedCount;
            }, selectors, debugMode);

            if (debugMode) console.log(`[DEBUG] Number of expanded panels/rows: ${expanded}`);
            return expanded;
        }

        const expandPanels = process.env.EXPAND_COLLAPSED_PANELS !== 'false';
        if (expandPanels) {
            console.log("Searching and expanding collapsed panels/rows...");
            const expanded = await expandCollapsedPanels(page);
            if (expanded > 0) {
                console.log(`Expanded ${expanded} panels/rows. Waiting for content to load...`);
                await page.evaluate(timeout => new Promise(resolve => setTimeout(resolve, timeout)), 2000 + expanded * 500);
            } else {
                console.log("No collapsed panels/rows found.");
            }
        } else {
            console.log("Automatic expansion of collapsed panels is disabled.");
        }

        // IMPROVED: Enhanced height detection with Grafana 12 specific selectors
        let scrollableSection = null;
        const totalHeight = await page.evaluate(() => {
            console.log("Attempting to detect page height with multiple selectors...");

            // Priority list of selectors for different Grafana versions
            const selectors = [
                '[data-testid="dashboard-grid"]',       // Grafana 12 dashboard grid (highest priority)
                '[data-testid="scrollbar-view"]',       // Grafana 11.5+
                '.scrollbar-view',                      // Grafana <= 11.4
                '.main-view',                           // Alternative main view
                '.dashboard-container',                 // Dashboard container
                '.react-grid-layout',                   // Dashboard panels grid
                '.dashboard-scroll',                    // Scrollable dashboard area
                'main',                                 // Main HTML element
                '.panel-container',                     // Panel container fallback
                'body'                                  // Ultimate fallback
            ];

            let selectorUsed = '';

            // Try each selector until we find one
            for (const selector of selectors) {
                console.log(`Trying selector: ${selector}`);
                scrollableSection = document.querySelector(selector);
                if (scrollableSection) {
                    selectorUsed = selector;
                    console.log(`Successfully found element with selector: ${selector}`);
                    break;
                }
            }

            if (!scrollableSection) {
                console.log("No suitable element found, using document.body as fallback");
                scrollableSection = document.body;
                selectorUsed = 'body (fallback)';
            }

            // Different height calculation strategies
            let height = null;

            // NEW: Grafana 12 specific panel height calculation
            const allPanelSelectors = [
                '[data-testid="panel"]',
                '.panel-container',
                '.react-grid-item',
                '.dashboard-panel'
            ];

            let panels = [];
            for (const selector of allPanelSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements && elements.length > 0) {
                    panels = Array.from(elements);
                    console.log(`Using ${selector} for panel height calculation, found ${panels.length} panels`);
                    break;
                }
            }

            if (panels.length > 0) {
                let maxBottom = 0;
                panels.forEach((panel, idx) => {
                    const rect = panel.getBoundingClientRect();
                    console.log(`Panel ${idx+1} position: top=${rect.top}, bottom=${rect.bottom}`);
                    maxBottom = Math.max(maxBottom, rect.bottom);
                });

                if (maxBottom > 100) {
                    height = Math.ceil(maxBottom + 100); // Add padding
                    console.log(`Height calculated from ${panels.length} panels: ${height}`);
                    return height;
                }
            }

            // Original height calculation strategies as fallback
            if (!height && scrollableSection.firstElementChild && scrollableSection.firstElementChild.scrollHeight > 100) {
                height = scrollableSection.firstElementChild.scrollHeight;
                console.log(`Height from firstElementChild.scrollHeight: ${height} (selector: ${selectorUsed})`);
            }

            if (!height && scrollableSection.scrollHeight > 100) {
                height = scrollableSection.scrollHeight;
                console.log(`Height from element.scrollHeight: ${height} (selector: ${selectorUsed})`);
            }

            if (!height) {
                const rect = scrollableSection.getBoundingClientRect();
                if (rect.height > 100) {
                    height = Math.ceil(rect.height);
                    console.log(`Height from getBoundingClientRect: ${height} (selector: ${selectorUsed})`);
                }
            }

            // Fallback height
            if (!height) {
                height = Math.max(window.innerHeight * 2, 1600);
                console.log(`Using fallback height: ${height}`);
            }

            console.log(`Final height determined: ${height} using selector: ${selectorUsed}`);
            return height;
        });

        if (!totalHeight || totalHeight < 100) {
            console.log("Warning: Could not determine reliable page height, using fallback of 1600px");
            const fallbackHeight = 1600;

            // Advanced scrolling technique for Grafana 12
            await page.evaluate(async () => {
                console.log("Performing comprehensive scrolling to ensure all content is loaded...");

                // Progressive scrolling with pauses
                const viewportHeight = window.innerHeight;
                const maxScrolls = 15;  // Increased for Grafana 12
                const scrollDelay = 500;

                for (let i = 0; i < maxScrolls; i++) {
                    window.scrollTo(0, i * viewportHeight / 2);
                    await new Promise(resolve => setTimeout(resolve, scrollDelay));
                }

                // Scroll back to top
                window.scrollTo(0, 0);
                await new Promise(resolve => setTimeout(resolve, scrollDelay));
            });

            console.log("Page height set to fallback:", fallbackHeight);
        } else {
            console.log("Page height successfully determined:", totalHeight);

            // Enhanced scrolling for Grafana 12
            await page.evaluate(async () => {
                console.log("Performing enhanced scrolling to load all content...");

                // Progressive scroll approach
                const viewportHeight = window.innerHeight;
                const totalScrolls = Math.ceil(document.body.scrollHeight / (viewportHeight / 2));
                const scrollDelay = 500;

                console.log(`Planning ${totalScrolls} scroll steps`);

                // First scroll down gradually
                for (let i = 0; i < totalScrolls; i++) {
                    window.scrollTo(0, i * viewportHeight / 2);
                    await new Promise(resolve => setTimeout(resolve, scrollDelay));
                }

                // Then scroll back up gradually
                for (let i = totalScrolls; i >= 0; i--) {
                    window.scrollTo(0, i * viewportHeight / 2);
                    await new Promise(resolve => setTimeout(resolve, scrollDelay));
                }

                console.log("Progressive scrolling completed");
            });
        }

        await page.evaluate((hideDashboardControls) => {
            const selectorsToHide = [
                '.panel-info-corner',
                '.react-resizable-handle',
                'div[data-testid*="Alert error"]',
                'div[data-testid*="title-items-container"]',
                'div[class*="toolbar-button-panel-menu"]'
            ];

            if (hideDashboardControls) {
                selectorsToHide.push(
                    '.dashboard-controls',
                    '.dashboard-toolbar',
                    'div[data-testid*="dashboard controls"]',
                );
            }

            selectorsToHide.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.hidden = true;
                });
            });
        }, process.env.HIDE_DASHBOARD_CONTROLS === 'true');

        if (process.env.CHECK_QUERIES_TO_COMPLETE === 'true' && !finalUrl.includes('viewPanel=')) {
            console.log("Waiting for all queries to complete...");

            await page.evaluate(async () => {
                if (scrollableSection) {
                    console.log("Scrolling to the bottom of the page to trigger all queries...");
                    const totalScrollHeight = scrollableSection.scrollHeight;
                    const viewportHeight = window.innerHeight;
                    let scrollPosition = 0;

                    while (scrollPosition < totalScrollHeight) {
                        scrollableSection.scrollBy(0, viewportHeight);
                        scrollPosition += viewportHeight;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            });

            const panelQueryCount = await page.evaluate(async () => {
                const url = window.performance.getEntriesByType("resource")
                    .filter(request => (request.initiatorType === 'fetch' && request.name.includes('/dashboards/uid/')))[0].name;
                console.log(url)
                const response = await fetch(url);
                const json = await response.json();
                const panels = json.dashboard.panels || [];
                let count = panels.filter(panel => panel.datasource).length;

                panels
                    .filter(panel => panel.type === 'row' && Array.isArray(panel.panels))
                    .forEach(rowPanel => {
                        count += rowPanel.panels.filter(subPanel => subPanel.datasource).length;
                    });
                console.log(`Total Panel Queries Expected: ${count}`);

                return count;
            });

            const maxWaitTime = process.env.CHECK_QUERIES_TO_COMPLETE_QUERIES_COMPLETION_TIMEOUT || 60000;
            const interval = process.env.CHECK_QUERIES_TO_COMPLETE_QUERIES_INTERVAL || 4000;
            let elapsedTime = 0;
            let lastCompletedCount = 0;
            let stableCountTime = 0;

            while (elapsedTime < maxWaitTime) {
                const completedQueryCount = await page.evaluate(() => {
                    return window.performance.getEntriesByType("resource")
                        .filter(request => (request.initiatorType === 'fetch' && request.name.includes('query?'))).length;
                });

                console.log(`Completed Queries: ${completedQueryCount} / ${panelQueryCount}`);

                if (completedQueryCount === panelQueryCount) {
                    console.log("All queries have completed.");
                    break;
                }

                if (completedQueryCount === lastCompletedCount) {
                    stableCountTime += interval;
                    if (stableCountTime >= process.env.CHECK_QUERIES_TO_COMPLETE_MAX_QUERY_COMPLETION_TIME || 30000) {
                        throw new Error("Query completion seems to be stuck. Exiting after no progress for " + process.env.CHECK_QUERIES_TO_COMPLETE_MAX_QUERY_COMPLETION_TIME +"ms.");
                    }
                } else {
                    stableCountTime = 0;
                }

                lastCompletedCount = completedQueryCount;
                await new Promise(resolve => setTimeout(resolve, interval));
                elapsedTime += interval;
            }

            if (elapsedTime >= maxWaitTime) {
                throw new Error("Timeout: Not all queries completed within the allowed time.");
            }
        }

        // Add a final check for all panels and ensure they're visible
        await page.evaluate(async () => {
            console.log("Final check for panel visibility...");

            // Find all panels with any known selector
            const panelSelectors = [
                '[data-testid="panel"]',
                '.panel-container',
                '.react-grid-item',
                '.dashboard-panel',
                '.grafana-panel'
            ];

            let allPanels = [];
            for (const selector of panelSelectors) {
                const panels = document.querySelectorAll(selector);
                if (panels && panels.length > 0) {
                    allPanels = Array.from(panels);
                    console.log(`Found ${panels.length} panels with selector ${selector}`);
                    break;
                }
            }

            if (allPanels.length > 0) {
                // Make sure all panels are visible
                allPanels.forEach((panel, i) => {
                    panel.style.display = 'block';
                    panel.style.visibility = 'visible';
                    panel.style.opacity = '1';

                    // Ensure any lazy-loaded content inside panels is visible
                    const charts = panel.querySelectorAll('.graph-canvas, .graph-panel, canvas, svg');
                    charts.forEach(chart => {
                        chart.style.visibility = 'visible';
                        chart.style.opacity = '1';
                    });
                });

                console.log(`Ensured visibility of ${allPanels.length} panels`);
            }

            // Extra wait to ensure charts render
            await new Promise(resolve => setTimeout(resolve, 2000));
        });

        // Final wait for all panels to be fully rendered
        console.log("Final wait for all panels to render completely...");
        await page.evaluate(timeout => {
            return new Promise(resolve => setTimeout(resolve, timeout));
        }, 5000);

        const finalHeight = totalHeight && totalHeight >= 100 ? totalHeight : 1600;

        await page.setViewport({
            width: width_px,
            height: finalHeight,
            deviceScaleFactor: 2,
            isMobile: false
        });

        console.log("Generating PDF...");
        await page.pdf({
            path: outfile,
            width: width_px + 'px',
            height: finalHeight + 'px',
            printBackground: true,
            scale: 1,
            displayHeaderFooter: false,
            margin: {top: 0, right: 0, bottom: 0, left: 0}
        });
        console.log(`PDF generated: ${outfile}`);

        await browser.close();
        console.log("Browser closed.");

        process.send({ success: true, path: outfile });
    } catch (error) {
        console.error("Error during PDF generation:", error.message);
        process.send({ success: false, error: error.message });
        process.exit(1);
    }
})();
