Chart.register(ChartDataLabels);

    let curLevel = 'facility'; // 'facility' or 'hsc'
    let curView = 'active'; // 'active', 'all', 'inactive'
    let sortField = 'penta1';
    let sortAsc = false;
    let gradeFilter = 'all';
    let selectedMapBlock = "";
    let lastBlockFilter = "";
    let currentReportDate = "April 2026";

    // Active & Inactive computed sets
    let currentDataset = [];
    let active = [];
    let inactive = [];

    // Chart.js instances
    let chartPenta = null;
    let chartDropout = null;
    let chartLoad = null;
    let curDropoutMetric = 'penta';

    // Target analysis state variables
    let targetSource = 'fixed'; // 'fixed' or 'custom'
    let targetPeriod = 'monthly'; // 'yearly' or 'monthly'
    let targetMetric = 'penta1'; // 'penta1', 'bcg', 'mr1', 'infants', 'total_beneficiaries'
    let targetSortMode = 'rate_desc'; // 'rate_desc', 'rate_asc', 'name_asc', 'target_desc'
    let customTargets = {};
    let chartTargetAchievement = null;
    let customTargetsLocked = false;

    // Antigen comparison configuration
    const ANTIGENS = {
      penta1: { label: 'Penta 1', key: 'penta1', color: '#2563eb' },
      penta2: { label: 'Penta 2', key: 'penta2', color: '#8b5cf6' },
      penta3: { label: 'Penta 3', key: 'penta3', color: '#10b981' },
      bcg: { label: 'BCG', key: 'bcg', color: '#f59e0b' },
      mr1: { label: 'MR 1', key: 'mr1', color: '#ef4444' },
      mr2: { label: 'MR 2', key: 'mr2', color: '#ec4899' }
    };
    let selectedAntigens = ['penta1', 'penta3'];

    // Helper to calculate Penta-2 when missing from default data
    function ensurePenta2Data() {
      if (typeof DATA !== 'undefined') {
        if (DATA.facilities) {
          DATA.facilities.forEach(f => {
            if (f.penta2 === undefined) {
              f.penta2 = Math.round((f.penta1 + f.penta3) / 2);
            }
          });
        }
        if (DATA.hscs) {
          DATA.hscs.forEach(h => {
            if (h.penta2 === undefined) {
              h.penta2 = Math.round((h.penta1 + h.penta3) / 2);
            }
          });
        }
      }
    }

    // Antigen filter change handler
    function onAntigenFilterChange() {
      const selected = [];
      ['penta1', 'penta2', 'penta3', 'bcg', 'mr1', 'mr2'].forEach(id => {
        const chk = document.getElementById(`chk-${id}`);
        if (chk && chk.checked) {
          selected.push(id);
        }
      });

      if (selected.length === 0) {
        const chkP1 = document.getElementById('chk-penta1');
        if (chkP1) chkP1.checked = true;
        selected.push('penta1');
      }

      selectedAntigens = selected;
      renderCharts();
    }
    window.onAntigenFilterChange = onAntigenFilterChange;

    // Dropout metric change handler
    function onDropoutMetricChange() {
      const select = document.getElementById('dropout-metric-select');
      if (select) {
        curDropoutMetric = select.value;
      }
      const printText = document.getElementById('print-dropout-text');
      if (printText) {
        printText.textContent = curDropoutMetric === 'penta' ? 'Penta 1 to Penta 3' : 'MR 1 to MR 2';
      }
      renderCharts();
    }
    window.onDropoutMetricChange = onDropoutMetricChange;

    // Helper to extract report period/month from filename or raw rows
    function extractReportDate(rows, fileName) {
      const monthRegex = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s_-]*(\d{4})/i;
      const fileMatch = fileName.match(monthRegex);
      if (fileMatch) {
        let month = fileMatch[1];
        let year = fileMatch[2];
        month = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
        const monthMap = {
          'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
          'Jun': 'June', 'Jul': 'July', 'Aug': 'August', 'Sep': 'September',
          'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
        };
        if (monthMap[month]) month = monthMap[month];
        return `${month} ${year}`;
      }

      // Try searching first few rows for keywords
      for (let i = 0; i < Math.min(rows.length, 25); i++) {
        const row = rows[i];
        for (let key in row) {
          const val = String(row[key]);
          if (/report\s*period/i.test(key) || /report\s*period/i.test(val)) {
            const dateMatch = val.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s_-]*(\d{4})/i);
            if (dateMatch) {
              let month = dateMatch[1];
              let year = dateMatch[2];
              month = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
              const monthMap = {
                'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
                'Jun': 'June', 'Jul': 'July', 'Aug': 'August', 'Sep': 'September',
                'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
              };
              if (monthMap[month]) month = monthMap[month];
              return `${month} ${year}`;
            }
          }
          const dateRangeMatch = val.match(/\d{2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}\s*To\s*\d{2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}/i);
          if (dateRangeMatch) {
            let month = dateRangeMatch[2];
            let year = val.match(/To\s*\d{2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})/i)?.[2];
            if (month && year) {
              month = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
              const monthMap = {
                'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
                'Jun': 'June', 'Jul': 'July', 'Aug': 'August', 'Sep': 'September',
                'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
              };
              if (monthMap[month]) month = monthMap[month];
              return `${month} ${year}`;
            }
          }
        }
      }
      return null;
    }

    // Helper to download a specific Chart.js canvas as an image with solid white background
    function downloadChart(canvasId, defaultFilename) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const ctx = tempCanvas.getContext('2d');

      // Fill canvas background with white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // Draw original canvas over the white background
      ctx.drawImage(canvas, 0, 0);

      // Retrieve image data and trigger download
      const imageURI = tempCanvas.toDataURL("image/png");
      const link = document.createElement('a');
      const blockFilterVal = document.getElementById('block-filter').value;
      const suffix = (blockFilterVal ? `_${blockFilterVal.replace(/\s+/g, '_')}` : '') + `_${curLevel}_${currentReportDate.replace(/\s+/g, '_')}`;

      link.download = `${defaultFilename}_${suffix}.png`;
      link.href = imageURI;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Update webpage titles and printed header names dynamically
    function updateDynamicTitles() {
      const blk = document.getElementById('block-filter').value;
      const q = document.getElementById('search').value.trim();

      let locationStr = "Bhagalpur District";
      let titleStr = "Bhagalpur — Routine Immunization Dashboard";

      if (q) {
        const matchedItems = currentDataset.filter(f => {
          const name = curLevel === 'facility' ? f.facility : f.hsc;
          return name.toLowerCase().includes(q.toLowerCase());
        });

        if (matchedItems.length === 1) {
          const name = curLevel === 'facility' ? matchedItems[0].facility : matchedItems[0].hsc;
          locationStr = `${name} (${matchedItems[0].sub_district} Block)`;
        } else {
          locationStr = `Search: "${q}" in Bhagalpur`;
        }
      } else if (blk) {
        locationStr = `${blk} Block, Bhagalpur`;
      }

      // Update browser tab/window and PDF header
      document.title = `${locationStr} — Routine Immunization Report (${currentReportDate})`;

      // Update header elements in DOM
      const locEl = document.getElementById('location-text');
      if (locEl) locEl.textContent = locationStr;

      const mainTitleEl = document.getElementById('main-title');
      if (mainTitleEl) {
        if (q && currentDataset.filter(f => (curLevel === 'facility' ? f.facility : f.hsc).toLowerCase().includes(q.toLowerCase())).length === 1) {
          mainTitleEl.textContent = curLevel === 'facility' ? "Facility Immunization Report" : "HSC Immunization Report";
        } else if (blk) {
          mainTitleEl.textContent = "Block Immunization Report";
        } else {
          mainTitleEl.textContent = "Bhagalpur — Routine Immunization Dashboard";
        }
      }
    }

    // Update UI elements for report date
    function updateReportDateUI(dateStr) {
      currentReportDate = dateStr;
      
      const calEl = document.getElementById('calendar-text');
      if (calEl) calEl.textContent = dateStr;
      
      const srTitleEl = document.getElementById('sr-header-title');
      if (srTitleEl) srTitleEl.textContent = `Bhagalpur Health Facility & HSC Routine Immunization Dashboard — ${dateStr}`;
      
      const distTitleEl = document.getElementById('district-summary-title');
      if (distTitleEl) distTitleEl.textContent = `District summary — ${dateStr}`;
      
      updateDynamicTitles();
    }


    function grade(f) {
      if (!f.sessions_held) return null;
      let score = 0;
      if (f.session_pct >= 100) score += 3; else if (f.session_pct >= 99) score += 2; else score += 1;
      if (f.avg_per_session >= 13) score += 3; else if (f.avg_per_session >= 10) score += 2; else score += 1;
      
      const penta1Threshold = curLevel === 'facility' ? 300 : 25;
      const penta1Mid = curLevel === 'facility' ? 100 : 8;
      
      if (f.penta1 >= penta1Threshold) score += 3; 
      else if (f.penta1 >= penta1Mid) score += 2; 
      else score += 1;

      if (f.dropout_penta !== null && f.dropout_penta <= 5) score += 2; 
      else if (f.dropout_penta !== null && f.dropout_penta <= 10) score += 1;

      if (score >= 10) return 'A'; if (score >= 7) return 'B'; if (score >= 5) return 'C'; return 'D';
    }

    function doColor(v) {
      if (v === null) return '';
      if (v > 10) return 'pr'; if (v >= 0) return 'pa'; return 'pg';
    }
    
    function doText(v) {
      if (v === null) return '—';
      if (v > 10) return '+' + v.toFixed(1) + '%';
      if (v >= 0) return '+' + v.toFixed(1) + '%';
      return v.toFixed(1) + '%';
    }

    // Set up blocks filter dropdown dynamically
    function populateBlockFilter() {
      const sel = document.getElementById('block-filter');
      sel.innerHTML = '<option value="">All blocks</option>';
      const blocks = [...new Set(DATA.facilities.map(f => f.sub_district))].sort();
      blocks.forEach(b => { 
        const o = document.createElement('option'); 
        o.value = b; 
        o.textContent = b; 
        sel.appendChild(o); 
      });
    }

    // Update block map heatmap colors
    function updateMapColors() {
      const metricEl = document.getElementById('map-metric-select');
      if (!metricEl) return; // Map section not present in DOM
      const metric = metricEl.value;
      const blockData = {};
      
      // Aggregate data by block
      DATA.facilities.forEach(f => {
        const blk = f.sub_district;
        if (!blockData[blk]) {
          blockData[blk] = { penta1: 0, sessions_held: 0, total_beneficiaries: 0, penta3: 0 };
        }
        blockData[blk].penta1 += f.penta1;
        blockData[blk].sessions_held += f.sessions_held;
        blockData[blk].total_beneficiaries += f.total_beneficiaries;
        blockData[blk].penta3 += f.penta3;
      });

      // Render colors on the map
      const mapBlocks = document.querySelectorAll('.map-block');
      mapBlocks.forEach(mb => {
        const blkName = mb.id.replace('mb-', '').replace('_', ' ');
        const data = blockData[blkName] || { penta1: 0, sessions_held: 0, total_beneficiaries: 0, penta3: 0 };
        
        let val = 0;
        let displayVal = "0";
        
        if (metric === 'penta1') {
          val = data.penta1;
          displayVal = val.toLocaleString();
        } else if (metric === 'sessions_held') {
          val = data.sessions_held;
          displayVal = val.toLocaleString();
        } else if (metric === 'dropout_penta') {
          val = data.penta1 > 0 ? parseFloat(((data.penta1 - data.penta3) / data.penta1 * 100).toFixed(1)) : 0;
          displayVal = val.toFixed(1) + "%";
        } else if (metric === 'avg_per_session') {
          val = data.sessions_held > 0 ? parseFloat((data.total_beneficiaries / data.sessions_held).toFixed(1)) : 0;
          displayVal = val.toFixed(1) + "/s";
        }

        // Apply color based on metric
        let rect = mb.querySelector('rect');
        rect.setAttribute('fill', getHeatmapColor(metric, val));
        
        // Update label value text
        let txt = mb.querySelector('.block-value');
        if (txt) txt.textContent = displayVal;

        // Visual selection indicator
        mb.classList.toggle('selected', selectedMapBlock === blkName);
      });
    }

    function getHeatmapColor(metric, val) {
      if (metric === 'dropout_penta') {
        if (val > 10) return '#ffe3e3'; // Light red
        if (val >= 0) return '#fff9db'; // Light yellow
        return '#e6fcf5'; // Light green
      }
      if (metric === 'avg_per_session') {
        if (val >= 15) return '#e6fcf5';
        if (val >= 7) return '#fff9db';
        return '#ffe3e3';
      }
      if (metric === 'sessions_held') {
        let maxVal = 500;
        let ratio = Math.min(val / maxVal, 1);
        return `rgba(16, 185, 129, ${0.1 + ratio * 0.75})`; // Green opacity
      }
      if (metric === 'penta1') {
        let maxVal = 1000;
        let ratio = Math.min(val / maxVal, 1);
        return `rgba(37, 99, 235, ${0.1 + ratio * 0.75})`; // Blue opacity
      }
      return '#f1f5f9';
    }

    function selectMapBlock(blockName) {
      if (selectedMapBlock === blockName) {
        selectedMapBlock = "";
        document.getElementById('block-filter').value = "";
      } else {
        selectedMapBlock = blockName;
        document.getElementById('block-filter').value = blockName;
      }
      updateMapColors();
      renderTable();
    }

    function clearMapSelection() {
      selectedMapBlock = "";
      document.getElementById('block-filter').value = "";
      updateMapColors();
      renderTable();
    }

    // Zero-Dose & Resource Wastage Risk Predictor logic
    function updateRiskAnalysis() {
      const zdList = document.getElementById('zero-dose-list');
      const wsList = document.getElementById('wastage-list');
      if (!zdList || !wsList) return; // Risk analysis section not present in DOM
      
      // Calculate Zero-dose risk: High BCG, Low Penta-1 (BCG - Penta-1 > threshold)
      const zeroDoseAlerts = [];
      // Calculate wastage: Held > 0, avg turnout < 7
      const wastageAlerts = [];

      const targetList = curLevel === 'facility' ? DATA.facilities : DATA.hscs;
      const displayNameOf = f => curLevel === 'facility' ? f.facility : f.hsc;

      targetList.forEach(f => {
        if (f.sessions_held > 0) {
          // Zero Dose criteria: BCG volume is double of Penta-1, with at least 10 BCG given
          if (f.bcg >= 10 && (f.penta1 === 0 || (f.bcg / f.penta1) >= 1.5)) {
            const gap = f.bcg - f.penta1;
            zeroDoseAlerts.push({
              name: displayNameOf(f),
              gap: gap,
              bcg: f.bcg,
              p1: f.penta1,
              block: f.sub_district,
              level: gap > 30 ? 'high' : 'med'
            });
          }

          // Wastage criteria: Completed sessions but turnout average is less than 6
          if (f.avg_per_session < 6) {
            wastageAlerts.push({
              name: displayNameOf(f),
              load: f.avg_per_session,
              block: f.sub_district,
              level: f.avg_per_session < 3.5 ? 'high' : 'med'
            });
          }
        }
      });

      // Sort & Render Zero Dose
      zeroDoseAlerts.sort((a, b) => b.gap - a.gap);
      if (zeroDoseAlerts.length === 0) {
        zdList.innerHTML = '<div class="no-data" style="padding:1rem; font-size:11px;"><i class="ti ti-check" style="color:var(--color-success)"></i> No zero-dose dropouts flagged</div>';
      } else {
        zdList.innerHTML = zeroDoseAlerts.map(a => `
          <div class="risk-item ${a.level}">
            <div>
              <div class="risk-name" title="${a.name}">${a.name.substring(0, 24)}</div>
              <div class="risk-action">BCG: ${a.bcg} · P1: ${a.p1} (${a.block})</div>
            </div>
            <div class="risk-value" style="color:${a.level==='high'?'var(--color-danger)':'var(--color-warning)'}">+${a.gap} gap</div>
          </div>
        `).join('');
      }

      // Sort & Render Wastage
      wastageAlerts.sort((a, b) => a.load - b.load);
      if (wastageAlerts.length === 0) {
        wsList.innerHTML = '<div class="no-data" style="padding:1rem; font-size:11px;"><i class="ti ti-check" style="color:var(--color-success)"></i> Turnout levels within targets</div>';
      } else {
        wsList.innerHTML = wastageAlerts.map(a => `
          <div class="risk-item ${a.level}">
            <div>
              <div class="risk-name" title="${a.name}">${a.name.substring(0, 24)}</div>
              <div class="risk-action">Low turnout risk (${a.block})</div>
            </div>
            <div class="risk-value" style="color:${a.level==='high'?'var(--color-danger)':'var(--color-warning)'}">${a.load.toFixed(1)}/s</div>
          </div>
        `).join('');
      }
    }

    // Export active table to CSV file download
    function exportTableToCSV() {
      const q = document.getElementById('search').value.toLowerCase();
      const blk = document.getElementById('block-filter').value;
      const sc = document.getElementById('sort-col').value;
      
      let sortingCol = sortField;
      if (sortingCol === 'facility' && curLevel === 'hsc') sortingCol = 'hsc';
      if (sc !== sortField) { sortField = sc; sortAsc = false; sortingCol = sc; }

      let data = curView === 'active' ? active : curView === 'inactive' ? inactive : currentDataset;
      
      if (q) {
        data = data.filter(f => {
          const name = curLevel === 'facility' ? f.facility : f.hsc;
          return name.toLowerCase().includes(q) || f.sub_district.toLowerCase().includes(q);
        });
      }
      if (blk) data = data.filter(f => f.sub_district === blk);

      data = [...data].sort((a, b) => {
        const av = a[sortingCol] ?? -9999, bv = b[sortingCol] ?? -9999;
        if (typeof av === 'string' && typeof bv === 'string') {
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return sortAsc ? (av - bv) : (bv - av);
      });

      // Build CSV output
      let csv = [];
      const headers = [curLevel === 'facility' ? 'Facility' : 'HSC Sub-Centre', 'Block', 'Sites', 'Sessions Held', 'Sessions Planned', 'Completion %', 'Avg Turnout', 'Penta-1', 'Penta-3', 'BCG', 'MR-1', 'MR-2', 'Penta Dropout %', 'MR Dropout %', 'Grade'];
      csv.push(headers.map(h => `"${h}"`).join(','));

      data.forEach(f => {
        const row = [
          curLevel === 'facility' ? f.facility : f.hsc,
          f.sub_district,
          f.sites,
          f.sessions_held,
          f.sessions_planned,
          f.session_pct.toFixed(0),
          f.avg_per_session.toFixed(1),
          f.penta1,
          f.penta3,
          f.bcg,
          f.mr1,
          f.mr2,
          f.dropout_penta !== null ? f.dropout_penta : '',
          f.dropout_mr !== null ? f.dropout_mr : '',
          grade(f) || ''
        ];
        csv.push(row.map(val => typeof val === 'string' ? `"${val}"` : val).join(','));
      });

      const csvContent = "data:text/csv;charset=utf-8," + csv.join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Routine_Immunization_Dashboard_Report_${curLevel}_${curView}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Upload & Parser Aggregation functions
    function setupFileUploader() {
      const dropZone = document.getElementById('drop-zone');
      const fileInput = document.getElementById('file-input');

      // Drag and drop events
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropZone.classList.add('dragover');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropZone.classList.remove('dragover');
        }, false);
      });

      dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) handleFile(files[0]);
      }, false);

      fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
      });
    }

    function handleFile(file) {
      const statusText = document.getElementById('upload-status');
      statusText.innerHTML = `<i class="ti ti-loader" style="animation: spin 1s linear infinite;"></i> Parsing "${file.name}"...`;
      
      const fileExt = file.name.split('.').pop().toLowerCase();
      if (fileExt === 'csv') {
        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: function(results) {
            processRawRows(results.data, file.name);
          },
          error: function(err) {
            statusText.textContent = "Error parsing CSV file: " + err.message;
            statusText.style.color = "var(--color-danger)";
          }
        });
      } else if (fileExt === 'xlsx' || fileExt === 'xls') {
        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, {defval: ""});
            processRawRows(rows, file.name);
          } catch(err) {
            statusText.textContent = "Error parsing Excel: " + err.message;
            statusText.style.color = "var(--color-danger)";
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        statusText.textContent = "Unsupported file type! Please upload a .csv or .xlsx file.";
        statusText.style.color = "var(--color-danger)";
      }
    }

    function getVal(row, possibleKeys, isNum = true) {
      for (let k of Object.keys(row)) {
        let cleanK = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        for (let pk of possibleKeys) {
          let cleanPk = pk.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (cleanK === cleanPk) {
            let val = row[k];
            if (isNum) {
              let n = parseFloat(val);
              return isNaN(n) ? 0 : n;
            }
            return val === undefined || val === null ? "" : String(val).trim();
          }
        }
      }
      return isNum ? 0 : "";
    }

    function processRawRows(rows, fileName) {
      const statusText = document.getElementById('upload-status');
      
      let facMap = {};
      let hscMap = {};
      let totalRowsParsed = 0;

      let hasPenta2Column = false;
      if (rows && rows.length > 0) {
        const firstRowKeys = Object.keys(rows[0]);
        hasPenta2Column = firstRowKeys.some(k => {
          let cleanK = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanK === 'childrenvaccinatedwithpenta2' || cleanK === 'penta2';
        });
      }

      try {
        rows.forEach(row => {
          let subDistrict = getVal(row, ["Sub District", "subdistrict", "block"], false);
          if (!subDistrict) return;
          
          totalRowsParsed++;
          
          let facilityName = getVal(row, ["Health Facility Name", "facility"], false);
          let hscName = getVal(row, ["Sub Center Name", "subcentername", "hsc"], false);
          let siteName = getVal(row, ["Session Site Name", "site"], false);
          
          let planned = getVal(row, ["Session Planned"]);
          let held = getVal(row, ["Session Held"]);
          let bcg = getVal(row, ["Children vaccinated with BCG", "bcg"]);
          let hepb = getVal(row, ["Children vaccinated with Hep B", "hepb"]);
          let opv0 = getVal(row, ["Children vaccinated with OPV-0", "opv0"]);
          let opv1 = getVal(row, ["Children vaccinated with OPV-1", "opv1"]);
          let penta1 = getVal(row, ["Children vaccinated with Penta-1", "penta1"]);
          let penta2 = getVal(row, ["Children vaccinated with Penta-2", "penta2"]);
          let penta3 = getVal(row, ["Children vaccinated with Penta-3", "penta3"]);
          let mr1 = getVal(row, ["Children vaccinated with MR-1", "mr1"]);
          let mr2 = getVal(row, ["Children vaccinated with MR-2", "mr2"]);
          let pw = getVal(row, ["Number of Pregnant Women vaccinated", "pregnantwomen", "pw"]);
          let inf = getVal(row, ["Number of Infants (0-1 year) vaccinated", "infants", "inf"]);
          let ch = getVal(row, ["Number of Children (>1 year) vaccinated", "children", "child"]);

          // Facility level aggregate
          if (facilityName) {
            if (!facMap[facilityName]) {
              facMap[facilityName] = {
                facility: facilityName,
                sub_district: subDistrict,
                sitesSet: new Set(),
                sessions_planned: 0,
                sessions_held: 0,
                bcg: 0, hepb: 0, opv0: 0, opv1: 0, penta1: 0, penta2: 0, penta3: 0, mr1: 0, mr2: 0,
                pw_vacc: 0, infants: 0, children_gt1: 0
              };
            }
            let f = facMap[facilityName];
            if (siteName) f.sitesSet.add(siteName);
            f.sessions_planned += planned;
            f.sessions_held += held;
            f.bcg += bcg; f.hepb += hepb; f.opv0 += opv0; f.opv1 += opv1;
            f.penta1 += penta1;
            f.penta2 += hasPenta2Column ? penta2 : Math.round((penta1 + penta3) / 2);
            f.penta3 += penta3;
            f.mr1 += mr1; f.mr2 += mr2;
            f.pw_vacc += pw; f.infants += inf; f.children_gt1 += ch;
          }

          // HSC level aggregate
          if (hscName) {
            if (!hscMap[hscName]) {
              hscMap[hscName] = {
                hsc: hscName,
                facility: facilityName,
                sub_district: subDistrict,
                sitesSet: new Set(),
                sessions_planned: 0,
                sessions_held: 0,
                bcg: 0, hepb: 0, opv0: 0, opv1: 0, penta1: 0, penta2: 0, penta3: 0, mr1: 0, mr2: 0,
                pw_vacc: 0, infants: 0, children_gt1: 0
              };
            }
            let h = hscMap[hscName];
            if (siteName) h.sitesSet.add(siteName);
            h.sessions_planned += planned;
            h.sessions_held += held;
            h.bcg += bcg; h.hepb += hepb; h.opv0 += opv0; h.opv1 += opv1;
            h.penta1 += penta1;
            h.penta2 += hasPenta2Column ? penta2 : Math.round((penta1 + penta3) / 2);
            h.penta3 += penta3;
            h.mr1 += mr1; h.mr2 += mr2;
            h.pw_vacc += pw; h.infants += inf; h.children_gt1 += ch;
          }
        });

        if (totalRowsParsed === 0) {
          throw new Error("No valid sub-district or block rows found in file.");
        }

        // Map aggregation maps to final arrays
        DATA.facilities = Object.values(facMap).map(f => {
          f.sites = f.sitesSet.size || 1;
          delete f.sitesSet;
          f.session_pct = f.sessions_planned > 0 ? (f.sessions_held / f.sessions_planned * 100) : 0;
          f.total_beneficiaries = f.pw_vacc + f.infants + f.children_gt1;
          f.avg_per_session = f.sessions_held > 0 ? (f.total_beneficiaries / f.sessions_held) : 0;
          f.dropout_penta = f.penta1 > 0 ? parseFloat(((f.penta1 - f.penta3) / f.penta1 * 100).toFixed(1)) : null;
          f.dropout_mr = f.mr1 > 0 ? parseFloat(((f.mr1 - f.mr2) / f.mr1 * 100).toFixed(1)) : null;
          return f;
        });

        DATA.hscs = Object.values(hscMap).map(h => {
          h.sites = h.sitesSet.size || 1;
          delete h.sitesSet;
          h.session_pct = h.sessions_planned > 0 ? (h.sessions_held / h.sessions_planned * 100) : 0;
          h.total_beneficiaries = h.pw_vacc + h.infants + h.children_gt1;
          h.avg_per_session = h.sessions_held > 0 ? (h.total_beneficiaries / h.sessions_held) : 0;
          h.dropout_penta = h.penta1 > 0 ? parseFloat(((h.penta1 - h.penta3) / h.penta1 * 100).toFixed(1)) : null;
          h.dropout_mr = h.mr1 > 0 ? parseFloat(((h.mr1 - h.mr2) / h.mr1 * 100).toFixed(1)) : null;
          return h;
        });

        // Extract month/year from upload
        const detectedDate = extractReportDate(rows, fileName);
        if (detectedDate) {
          updateReportDateUI(detectedDate);
        } else {
          updateReportDateUI("Uploaded Report");
        }

        // Reinitialize
        populateBlockFilter();
        changeViewLevel(curLevel);
        renderKPIs();
        clearMapSelection();
        
        document.getElementById('btn-reset-data').style.display = 'inline-flex';
        document.getElementById('footer-data-source').textContent = `${fileName} · Uploaded ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        statusText.innerHTML = `<i class="ti ti-circle-check" style="color:var(--color-success)"></i> Successfully uploaded "${fileName}" (${totalRowsParsed} rows)`;
        statusText.style.color = "var(--color-success)";
      } catch(err) {
        statusText.textContent = "Error parsing details: " + err.message;
        statusText.style.color = "var(--color-danger)";
      }
    }

    function resetToDefaultData() {
      const defaultDataObj = JSON.parse(DEFAULT_DATA);
      DATA.facilities = defaultDataObj.facilities;
      DATA.hscs = defaultDataObj.hscs;

      ensurePenta2Data();

      updateReportDateUI("April 2026");

      populateBlockFilter();
      changeViewLevel(curLevel);
      renderKPIs();
      clearMapSelection();

      document.getElementById('btn-reset-data').style.display = 'none';
      document.getElementById('upload-status').innerHTML = "Using default April 2026 dataset";
      document.getElementById('upload-status').style.color = "var(--color-primary)";
      document.getElementById('footer-data-source').textContent = 'Session Site Coverage Report · Apr 2026 · Bhagalpur, Bihar';
    }

    function changeViewLevel(lvl) {
      curLevel = lvl;
      document.getElementById('btn-lvl-facility').classList.toggle('on', lvl === 'facility');
      document.getElementById('btn-lvl-hsc').classList.toggle('on', lvl === 'hsc');

      // Update table header name
      const facHeader = document.getElementById('facility-header');
      if (lvl === 'facility') {
        facHeader.textContent = 'Facility';
        facHeader.setAttribute('onclick', "sortBy('facility')");
      } else {
        facHeader.textContent = 'Health Sub Centre (HSC)';
        facHeader.setAttribute('onclick', "sortBy('hsc')");
      }

      // Toggle target columns visibility in the table headers and cells
      const targetCols = document.querySelectorAll('.target-column');
      targetCols.forEach(col => {
        col.style.display = (lvl === 'facility' ? '' : 'none');
      });

      // Toggle target achievement UI controls and alerts
      const targetControls = document.getElementById('target-controls-container');
      const targetHscAlert = document.getElementById('target-hsc-alert');
      if (lvl === 'facility') {
        if (targetControls) targetControls.style.display = 'block';
        if (targetHscAlert) targetHscAlert.style.display = 'none';
      } else {
        if (targetControls) targetControls.style.display = 'none';
        if (targetHscAlert) targetHscAlert.style.display = 'flex';
      }

      // Update titles
      document.getElementById('chart-penta-title').innerHTML = `<i class="ti ti-chart-bar" style="margin-right:6px; vertical-align:middle; color:var(--color-primary)"></i>Antigen coverage by ${lvl === 'facility' ? 'facility' : 'HSC'}`;
      const suffixEl = document.getElementById('chart-dropout-suffix');
      if (suffixEl) {
        suffixEl.textContent = `(${lvl === 'facility' ? 'active facilities' : 'active HSCs'})`;
      }
      document.getElementById('chart-load-title').innerHTML = `<i class="ti ti-chart-line" style="margin-right:6px; vertical-align:middle; color:#6366f1"></i>Session load — avg beneficiaries per session by ${lvl === 'facility' ? 'facility' : 'HSC'}`;

      // Update datasets
      const rawData = lvl === 'facility' ? DATA.facilities : DATA.hscs;
      currentDataset = rawData;
      active = rawData.filter(f => f.sessions_held > 0);
      inactive = rawData.filter(f => f.sessions_held === 0);

      // Reset Tab counts
      const tabs = document.querySelectorAll('.tab-bar button[onclick^="setView"]');
      tabs[0].textContent = `Active (${active.length})`;
      tabs[1].textContent = `All (${currentDataset.length})`;
      tabs[2].textContent = `No sessions (${inactive.length})`;

      // District average computation
      const tot_bene = active.reduce((s, f) => s + f.total_beneficiaries, 0);
      const tot_sess = active.reduce((s, f) => s + f.sessions_held, 0);
      const distAvg = tot_sess > 0 ? (tot_bene / tot_sess).toFixed(1) : "0.0";
      document.getElementById('district-avg-label').textContent = `District avg: ${distAvg}`;

      renderTable();
      renderCharts();
      renderScorecards();
      updateMapColors();
      updateRiskAnalysis();
      renderTargetAchievement();
    }

    function setView(v) {
      curView = v;
      const buttons = document.querySelectorAll('.tab-bar button[onclick^="setView"]');
      buttons.forEach((b, i) => b.classList.toggle('on', ['active', 'all', 'inactive'][i] === v));
      renderTable();
    }

    function sortBy(col) {
      if (sortField === col) sortAsc = !sortAsc; else { sortField = col; sortAsc = false; }
      document.getElementById('sort-col').value = col;
      renderTable();
    }

    function renderTable() {
      const q = document.getElementById('search').value.toLowerCase();
      const blk = document.getElementById('block-filter').value;
      const sc = document.getElementById('sort-col').value;
      
      // Trigger chart re-rendering if block filter has changed
      if (lastBlockFilter !== blk) {
        lastBlockFilter = blk;
        renderCharts();
      }

      // Update webpage title and printed header
      updateDynamicTitles();

      let sortingCol = sortField;
      if (sortingCol === 'facility' && curLevel === 'hsc') sortingCol = 'hsc';
      if (sc !== sortField) { sortField = sc; sortAsc = false; sortingCol = sc; }

      let data = curView === 'active' ? active : curView === 'inactive' ? inactive : currentDataset;
      
      if (q) {
        data = data.filter(f => {
          const name = curLevel === 'facility' ? f.facility : f.hsc;
          return name.toLowerCase().includes(q) || f.sub_district.toLowerCase().includes(q);
        });
      }
      if (blk) data = data.filter(f => f.sub_district === blk);

      data = [...data].sort((a, b) => {
        let av, bv;
        if (sortingCol === 'target_fixed') {
          av = getFixedTarget(a.facility);
          bv = getFixedTarget(b.facility);
        } else if (sortingCol === 'target_achievement') {
          const aFixed = getFixedTarget(a.facility);
          const aCustom = customTargets[a.facility] !== undefined ? customTargets[a.facility] : aFixed;
          const aTarget = targetSource === 'fixed' ? aFixed : aCustom;
          av = aTarget > 0 ? ((a[targetMetric] || 0) / aTarget) : 0;

          const bFixed = getFixedTarget(b.facility);
          const bCustom = customTargets[b.facility] !== undefined ? customTargets[b.facility] : bFixed;
          const bTarget = targetSource === 'fixed' ? bFixed : bCustom;
          bv = bTarget > 0 ? ((b[targetMetric] || 0) / bTarget) : 0;
        } else {
          av = a[sortingCol] ?? -9999;
          bv = b[sortingCol] ?? -9999;
        }

        if (typeof av === 'string' && typeof bv === 'string') {
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return sortAsc ? (av - bv) : (bv - av);
      });

      const tbody = document.getElementById('fac-body');
      if (!data.length) { 
        tbody.innerHTML = `<tr><td colspan="${curLevel === 'facility' ? 17 : 14}" class="no-data"><i class="ti ti-ban" style="font-size:24px; display:block; margin-bottom:8px; color:var(--color-text-tertiary)"></i>No items match the search criteria</td></tr>`; 
        document.getElementById('tbl-count').textContent = `Showing 0 items`;
        return; 
      }

      tbody.innerHTML = data.map(f => {
        const g = grade(f);
        const gpill = g ? `<span class="sc-score ${g}" style="position:static;display:inline-flex;width:24px;height:24px;font-size:11px">${g}</span>` : '-';
        const spct = f.session_pct >= 100 ? 'pg' : f.session_pct >= 98 ? 'pa' : 'pr';
        const displayName = curLevel === 'facility' ? f.facility : f.hsc;
        const blockName = f.sub_district;
        
        let targetCells = '';
        if (curLevel === 'facility') {
          const fixedTarget = getFixedTarget(f.facility);
          const customTarget = customTargets[f.facility] !== undefined ? customTargets[f.facility] : fixedTarget;
          
          const baseTarget = targetSource === 'fixed' ? fixedTarget : customTarget;
          const targetVal = targetPeriod === 'yearly' ? baseTarget : parseFloat((baseTarget / 12).toFixed(1));
          
          const achievedVal = f[targetMetric] || 0;
          const achPct = targetVal > 0 ? (achievedVal / targetVal * 100) : 0;
          
          let achCls = 'pr';
          if (achPct >= 100) achCls = 'pg';
          else if (achPct >= 80) achCls = 'pa';
          
          const achText = targetVal > 0 ? `${achPct.toFixed(0)}%` : '—';
          
          // Use a clean and responsive progress layout
          targetCells = `
            <td class="target-column" style="font-weight:600;">${fixedTarget}</td>
            <td class="target-column">
              <input type="number" class="target-input" value="${customTarget}" onchange="updateCustomTarget('${f.facility.replace(/'/g, "\\'")}', this.value)" ${customTargetsLocked ? 'disabled' : ''}>
            </td>
            <td class="target-column">
              <div class="bar-w">
                <span class="pill ${achCls}">${achText}</span>
                <div class="bar-t" style="height:5px;"><div class="bar-f" style="width:${Math.min(achPct, 100)}%; background:${achPct >= 100 ? '#10b981' : achPct >= 80 ? '#f59e0b' : '#ef4444'};"></div></div>
              </div>
            </td>
          `;
        }

        return `<tr>
          <td style="font-weight:700;max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${displayName}">${displayName}</td>
          <td><span class="pill pb">${blockName}</span></td>
          <td>${f.sites}</td>
          <td><strong>${f.sessions_held}</strong><span style="color:var(--color-text-tertiary)">/${f.sessions_planned}</span></td>
          <td><span class="pill ${spct}">${f.session_pct.toFixed(0)}%</span></td>
          <td>${f.avg_per_session.toFixed(1)}</td>
          <td><strong>${f.penta1.toLocaleString()}</strong></td>
          <td>${f.penta3.toLocaleString()}</td>
          <td><strong>${f.bcg.toLocaleString()}</strong></td>
          <td>${f.mr1}</td>
          <td>${f.mr2}</td>
          <td>${f.dropout_penta !== null ? `<span class="pill ${doColor(f.dropout_penta)}">${doText(f.dropout_penta)}</span>` : '—'}</td>
          <td>${f.dropout_mr !== null ? `<span class="pill ${doColor(f.dropout_mr)}">${doText(f.dropout_mr)}</span>` : '—'}</td>
          ${targetCells}
          <td>${gpill}</td>
        </tr>`;
      }).join('');

      document.getElementById('tbl-count').textContent = `Showing ${data.length} item${data.length !== 1 ? 's' : ''}`;
    }

    function renderKPIs() {
      const tot_p1 = DATA.facilities.reduce((s, f) => s + f.penta1, 0);
      const tot_p3 = DATA.facilities.reduce((s, f) => s + f.penta3, 0);
      const tot_bene = DATA.facilities.reduce((s, f) => s + f.total_beneficiaries, 0);
      const tot_sess = DATA.facilities.reduce((s, f) => s + f.sessions_held, 0);
      const tot_bcg = DATA.facilities.reduce((s, f) => s + f.bcg, 0);
      const pDO = tot_p1 > 0 ? ((tot_p1 - tot_p3) / tot_p1 * 100).toFixed(1) : "0.0";

      const kpis = [
        { l: 'Total Immunizations', v: (tot_bene / 1000).toFixed(1) + 'K', s: 'Infants, children & pregnant women', cls: '' },
        { l: 'Total Sessions Held', v: tot_sess.toLocaleString(), s: 'Across all session sites', cls: 'bl' },
        { l: 'Total BCG administered', v: tot_bcg.toLocaleString(), s: 'BCG–Penta gap: ' + (tot_bcg - tot_p1), cls: 'am' },
        { l: 'Total Penta-1 administered', v: tot_p1.toLocaleString(), s: 'First-dose volume coverage', cls: 'gr' },
        { l: 'Penta dropout rate', v: pDO + '%', s: 'P1 → P3 net district loss', cls: parseFloat(pDO) > 5 ? 're' : parseFloat(pDO) > 0 ? 'am' : 'gr' },
        { l: 'Active Facilities', v: DATA.facilities.filter(f => f.sessions_held > 0).length, s: `Out of ${DATA.facilities.length} total facilities`, cls: 'bl' },
        { l: 'Active HSC Sub-Centres', v: DATA.hscs ? DATA.hscs.filter(h => h.sessions_held > 0).length : 0, s: 'Sub-centres with held sessions', cls: 'gr' },
        { l: 'Inactive HSCs (No sessions)', v: DATA.hscs ? DATA.hscs.filter(h => h.sessions_held === 0).length : 0, s: 'No coverage during this period', cls: 're' },
      ];
      document.getElementById('kpi-row').innerHTML = kpis.map(k => `
        <div class="kpi ${k.cls}">
          <div>
            <div class="kpi-lbl">${k.l}</div>
            <div class="kpi-val">${k.v}</div>
          </div>
          <div class="kpi-sub">${k.s}</div>
        </div>
      `).join('');
    }

    // Chart.js Default styling tweaks for modern layout
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
    Chart.defaults.font.weight = 500;
    Chart.defaults.color = '#64748b';

    function renderCharts() {
      if (chartPenta) chartPenta.destroy();
      if (chartDropout) chartDropout.destroy();
      if (chartLoad) chartLoad.destroy();

      // Filter chart data by block if one is selected
      const blk = document.getElementById('block-filter').value;
      let chartActive;
      let isHscDataForCharts = false;

      if (blk) {
        // Show HSC-wise data of that specific block
        chartActive = DATA.hscs.filter(h => h.sub_district === blk && h.sessions_held > 0);
        isHscDataForCharts = true;
      } else {
        chartActive = active;
        isHscDataForCharts = (curLevel === 'hsc');
      }

      // Update titles dynamically based on whether charts display HSC or facility level data
      const chartLevelText = isHscDataForCharts ? 'HSC' : 'facility';
      const chartActiveText = isHscDataForCharts ? 'active HSCs' : 'active facilities';
      document.getElementById('chart-penta-title').innerHTML = `<i class="ti ti-chart-bar" style="margin-right:6px; vertical-align:middle; color:var(--color-primary)"></i>Antigen coverage by ${chartLevelText}`;
      const suffixEl = document.getElementById('chart-dropout-suffix');
      if (suffixEl) {
        suffixEl.textContent = `(${chartActiveText})`;
      }
      document.getElementById('chart-load-title').innerHTML = `<i class="ti ti-chart-line" style="margin-right:6px; vertical-align:middle; color:#6366f1"></i>Session load — avg beneficiaries per session by ${chartLevelText}`;

      // Compute average dynamically based on whether we are showing HSC or facility level
      const avgDataset = isHscDataForCharts ? DATA.hscs.filter(h => h.sessions_held > 0) : DATA.facilities.filter(f => f.sessions_held > 0);
      const tot_bene = avgDataset.reduce((s, f) => s + f.total_beneficiaries, 0);
      const tot_sess = avgDataset.reduce((s, f) => s + f.sessions_held, 0);
      const computedDistAvg = tot_sess > 0 ? (tot_bene / tot_sess).toFixed(1) : "0.0";
      document.getElementById('district-avg-label').textContent = `District avg: ${computedDistAvg}`;
      const parsedDistAvg = parseFloat(computedDistAvg);

      const numItems = chartActive.length;

      // Update dynamic custom legend in HTML
      const pentaLegend = document.getElementById('penta-legend');
      if (pentaLegend) {
        pentaLegend.innerHTML = selectedAntigens.map(ant => `
          <span><span class="ld" style="background:${ANTIGENS[ant].color}"></span>${ANTIGENS[ant].label}</span>
        `).join('');
      }

      // Sizing horizontal scroll chart wrappers
      const pentaWrapper = document.getElementById('c-penta-wrapper');
      if (pentaWrapper) {
        const parentWidth = pentaWrapper.parentElement.clientWidth || 600;
        // Spacing scales with selected antigens comparison count
        const barSpacing = Math.max(35, selectedAntigens.length * 15);
        const dynamicWidth = Math.max(parentWidth, numItems * barSpacing);
        pentaWrapper.style.width = `${dynamicWidth}px`;
      }

      // Sizing vertical scroll wrapper (Dropout is a horizontal bar chart)
      const act_do = chartActive.filter(f => {
        const val = curDropoutMetric === 'penta' ? f.dropout_penta : f.dropout_mr;
        return val !== null;
      });
      const dropoutWrapper = document.getElementById('c-dropout-wrapper');
      if (dropoutWrapper) {
        const dynamicHeight = Math.max(320, act_do.length * 25);
        dropoutWrapper.style.height = `${dynamicHeight}px`;
      }

      const loadWrapper = document.getElementById('c-load-wrapper');
      if (loadWrapper) {
        const parentWidth = loadWrapper.parentElement.clientWidth || 600;
        const dynamicWidth = Math.max(parentWidth, numItems * 35);
        loadWrapper.style.width = `${dynamicWidth}px`;
      }

      const displayNameOf = f => isHscDataForCharts ? f.hsc : f.facility;
      
      const shortName = n => {
        let name = displayNameOf(n);
        name = name.replace(/ CHC| PHC| UPHC| HSC/g, '');
        name = name.replace('LNJPN SADAR HOSPITAL BHAGALPUR', 'LNJPN Sadar');
        name = name.replace('Jawaharlal Nehru Medical College and Hospital  Bgp', 'JLNMCH');
        return name.substring(0, 12);
      };

      // Build comparative datasets dynamically
      const pentaDatasets = selectedAntigens.map(ant => {
        const config = ANTIGENS[ant];
        return {
          label: config.label,
          data: chartActive.map(f => f[config.key] || 0),
          backgroundColor: config.color,
          borderRadius: 4
        };
      });

      // 1. Antigen Coverage / Penta Chart
      chartPenta = new Chart(document.getElementById('c-penta'), {
        type: 'bar',
        data: {
          labels: chartActive.map(f => shortName(f)),
          datasets: pentaDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'top',
              font: { size: 8, weight: 'bold' },
              color: '#475569',
              formatter: (v) => v > 0 ? v : ''
            }
          },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#64748b', maxRotation: 45, autoSkip: false }, grid: { display: false } },
            y: { grace: '12%', ticks: { font: { size: 10 }, color: '#64748b' }, grid: { color: '#f1f5f9' } }
          }
        }
      });

      // 3. Dropout Chart
      const doColors = act_do.map(f => {
        const val = curDropoutMetric === 'penta' ? f.dropout_penta : f.dropout_mr;
        return val > 10 ? '#ef4444' : val >= 0 ? '#f59e0b' : '#10b981';
      });
      
      chartDropout = new Chart(document.getElementById('c-dropout'), {
        type: 'bar',
        data: {
          labels: act_do.map(f => shortName(f)),
          datasets: [{ 
            label: 'Dropout %', 
            data: act_do.map(f => curDropoutMetric === 'penta' ? f.dropout_penta : f.dropout_mr), 
            backgroundColor: doColors, 
            borderRadius: 4, 
            borderSkipped: false 
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'right',
              font: { size: 8, weight: 'bold' },
              color: '#475569',
              formatter: (v) => v !== null ? v.toFixed(1) + '%' : '—'
            }
          },
          scales: {
            x: { grace: '15%', ticks: { font: { size: 10 }, color: '#64748b', callback: v => v + '%' }, grid: { color: '#f1f5f9' } },
            y: { ticks: { font: { size: 9 }, color: '#64748b' }, grid: { display: false } }
          }
        }
      });

      // 4. Session Load Chart
      const sortedLoad = [...chartActive].sort((a, b) => b.avg_per_session - a.avg_per_session);
      
      chartLoad = new Chart(document.getElementById('c-load'), {
        type: 'bar',
        data: {
          labels: sortedLoad.map(f => shortName(f)),
          datasets: [
            { label: 'Avg/session', data: sortedLoad.map(f => f.avg_per_session), backgroundColor: '#6366f1', borderRadius: 4 },
            { label: 'District avg', data: sortedLoad.map(() => parsedDistAvg), borderColor: '#ef4444', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, type: 'line' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'top',
              font: { size: 8, weight: 'bold' },
              color: '#475569',
              formatter: (v, context) => {
                if (context.datasetIndex === 1) return null;
                return v.toFixed(1);
              }
            }
          },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#64748b', maxRotation: 45, autoSkip: false }, grid: { display: false } },
            y: { grace: '12%', ticks: { font: { size: 10 }, color: '#64748b' }, grid: { color: '#f1f5f9' } }
          }
        }
      });
    }

    // Scorecards Section
    function filterGrade(g) {
      gradeFilter = g;
      document.querySelectorAll('#grade-tabs .tb').forEach(b => b.classList.toggle('on', b.textContent.startsWith(g === 'all' ? 'All' : 'Grade ' + g)));
      renderScorecards();
    }

    function renderScorecards() {
      let data = active;
      if (gradeFilter !== 'all') data = data.filter(f => grade(f) === gradeFilter);
      
      const el = document.getElementById('scorecard-container');
      if (!data.length) { 
        el.innerHTML = '<div class="no-data"><i class="ti ti-mood-empty" style="font-size:24px; display:block; margin-bottom:8px; color:var(--color-text-tertiary)"></i>No facilities match the chosen performance grade</div>'; 
        return; 
      }
      
      // Limit to first 48 scorecards for performance at HSC level
      const sliceData = curLevel === 'facility' ? data : data.slice(0, 48);
      const isTruncated = data.length > sliceData.length;

      let htmlContent = sliceData.map(f => {
        const g = grade(f);
        const displayName = curLevel === 'facility' ? f.facility : f.hsc;
        const subText = curLevel === 'facility' ? f.sub_district : `${f.facility} · ${f.sub_district}`;
        
        // Dynamic bars sizing
        const p1Max = curLevel === 'facility' ? 8 : 0.8;
        const bcgMax = curLevel === 'facility' ? 8 : 0.8;

        const p1bar = Math.min(f.penta1 / p1Max, 100);
        const bcgBar = Math.min(f.bcg / bcgMax, 100);

        return `<div class="sc">
          <div class="sc-score ${g}">${g}</div>
          <div class="sc-name" title="${displayName}">${displayName}</div>
          <div class="sc-sub"><i class="ti ti-tag" style="margin-right:2px; vertical-align:middle;"></i>${subText} &nbsp;·&nbsp; <i class="ti ti-building" style="margin-right:2px; vertical-align:middle;"></i>${f.sites} sites</div>
          
          <div class="progress-row">
            <div class="pr-lbl"><span>Penta-1</span><span>${f.penta1}</span></div>
            <div class="bar-t" style="height:5px"><div class="bar-f" style="width:${p1bar}%;background:#2563eb"></div></div>
            
            <div class="pr-lbl" style="margin-top:6px"><span>BCG</span><span>${f.bcg}</span></div>
            <div class="bar-t" style="height:5px"><div class="bar-f" style="width:${bcgBar}%;background:#f59e0b"></div></div>
            
            <div class="pr-lbl" style="margin-top:6px"><span>Sessions</span><span>${f.session_pct.toFixed(0)}%</span></div>
            <div class="bar-t" style="height:5px"><div class="bar-f" style="width:${Math.min(f.session_pct, 100)}%;background:#10b981"></div></div>
          </div>
          
          <div class="sc-metrics" style="margin-top:10px">
            <div class="sc-m"><div class="sc-mv" style="color:#2563eb">${f.penta1}</div><div class="sc-ml">Penta-1</div></div>
            <div class="sc-m"><div class="sc-mv" style="color:#10b981">${f.mr1}</div><div class="sc-ml">MR-1</div></div>
            <div class="sc-m"><div class="sc-mv" style="color:${f.dropout_penta > 10 ? 'var(--color-danger)' : f.dropout_penta >= 0 ? 'var(--color-warning)' : 'var(--color-success)'}">${f.dropout_penta !== null ? doText(f.dropout_penta) : '—'}</div><div class="sc-ml">P1→P3</div></div>
            <div class="sc-m"><div class="sc-mv" style="color:#6366f1">${f.avg_per_session.toFixed(1)}</div><div class="sc-ml">avg/sess</div></div>
          </div>
        </div>`;
      }).join('');
      
      if (isTruncated) {
        htmlContent += `<div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; font-weight: 600; color: var(--color-text-secondary); background: var(--color-background-primary); border: 1px dashed var(--color-border-tertiary); border-radius: var(--border-radius-lg);">Showing top 48 scorecards of ${data.length} total. Use search or block filter to narrow down results.</div>`;
      }
      
      el.innerHTML = htmlContent;
    }

    // Target analysis functions and state management
    function initializeCustomTargets() {
      const saved = localStorage.getItem('bhagalpur_custom_targets');
      if (saved) {
        try {
          customTargets = JSON.parse(saved);
        } catch (e) {
          console.error("Error parsing custom targets from localStorage", e);
          customTargets = {};
        }
      }
      
      if (typeof DATA !== 'undefined' && DATA.facilities) {
        DATA.facilities.forEach(f => {
          const fixedVal = getFixedTarget(f.facility);
          if (customTargets[f.facility] === undefined) {
            customTargets[f.facility] = fixedVal;
          }
        });
      }
      saveCustomTargets();
    }
    window.initializeCustomTargets = initializeCustomTargets;

    function saveCustomTargets() {
      localStorage.setItem('bhagalpur_custom_targets', JSON.stringify(customTargets));
    }
    window.saveCustomTargets = saveCustomTargets;

    function changeTargetSource(src) {
      targetSource = src;
      document.getElementById('btn-target-source-fixed').classList.toggle('on', src === 'fixed');
      document.getElementById('btn-target-source-custom').classList.toggle('on', src === 'custom');
      
      const bulkEditor = document.getElementById('custom-target-bulk-editor');
      if (bulkEditor) {
        bulkEditor.style.display = (src === 'custom' ? 'flex' : 'none');
      }

      renderTable();
      renderTargetAchievement();
    }
    window.changeTargetSource = changeTargetSource;

    function changeTargetPeriod(period) {
      targetPeriod = period;
      document.getElementById('btn-target-period-yearly').classList.toggle('on', period === 'yearly');
      document.getElementById('btn-target-period-monthly').classList.toggle('on', period === 'monthly');

      renderTable();
      renderTargetAchievement();
    }
    window.changeTargetPeriod = changeTargetPeriod;

    function onTargetMetricChange() {
      const select = document.getElementById('target-metric-select');
      if (select) {
        targetMetric = select.value;
      }
      renderTable();
      renderTargetAchievement();
    }
    window.onTargetMetricChange = onTargetMetricChange;

    function onTargetSortChange() {
      const select = document.getElementById('target-sort-select');
      if (select) {
        targetSortMode = select.value;
      }
      renderTargetAchievement();
    }
    window.onTargetSortChange = onTargetSortChange;

    function updateCustomTarget(facilityName, value) {
      let numVal = parseFloat(value);
      if (isNaN(numVal) || numVal < 0) numVal = 0;
      customTargets[facilityName] = Math.round(numVal);
      saveCustomTargets();
      
      renderTable();
      renderTargetAchievement();
    }
    window.updateCustomTarget = updateCustomTarget;

    function adjustCustomTargetsBulk(factor) {
      for (let key in customTargets) {
        let currentTarget = customTargets[key];
        customTargets[key] = Math.round(currentTarget * factor);
      }
      saveCustomTargets();
      renderTable();
      renderTargetAchievement();
    }
    window.adjustCustomTargetsBulk = adjustCustomTargetsBulk;

    function resetCustomTargetsBulk() {
      if (typeof DATA !== 'undefined' && DATA.facilities) {
        DATA.facilities.forEach(f => {
          customTargets[f.facility] = getFixedTarget(f.facility);
        });
      }
      saveCustomTargets();
      renderTable();
      renderTargetAchievement();
    }
    window.resetCustomTargetsBulk = resetCustomTargetsBulk;

    function setBulkCustomTargetsValue() {
      const valInput = document.getElementById('bulk-multiplier-value');
      if (!valInput) return;
      let val = parseFloat(valInput.value);
      if (isNaN(val) || val < 0) return;
      
      for (let key in customTargets) {
        customTargets[key] = Math.round(val);
      }
      saveCustomTargets();
      valInput.value = ''; 
      renderTable();
      renderTargetAchievement();
    }
    window.setBulkCustomTargetsValue = setBulkCustomTargetsValue;


    function renderTargetAchievement() {
      if (curLevel !== 'facility') return; 

      const q = document.getElementById('search').value.toLowerCase();
      const blk = document.getElementById('block-filter').value;

      // Filter facilities
      let chartActive = DATA.facilities;
      if (q) {
        chartActive = chartActive.filter(f => f.facility.toLowerCase().includes(q) || f.sub_district.toLowerCase().includes(q));
      }
      if (blk) {
        chartActive = chartActive.filter(f => f.sub_district === blk);
      }

      // Calculate targets and achievements for each facility
      const processed = chartActive.map(f => {
        const fixedTarget = getFixedTarget(f.facility);
        const customTarget = customTargets[f.facility] !== undefined ? customTargets[f.facility] : fixedTarget;
        const baseTarget = targetSource === 'fixed' ? fixedTarget : customTarget;
        
        // Scale by period
        const targetVal = targetPeriod === 'yearly' ? baseTarget : parseFloat((baseTarget / 12).toFixed(1));
        const actualVal = f[targetMetric] || 0;
        const achRate = targetVal > 0 ? (actualVal / targetVal * 100) : 0;
        
        return {
          facility: f.facility,
          shortName: f.facility.replace(/ CHC| PHC| UPHC| HSC/g, '').substring(0, 12),
          target: targetVal,
          actual: actualVal,
          rate: achRate
        };
      });

      // Sort according to targetSortMode
      if (targetSortMode === 'rate_desc') {
        processed.sort((a, b) => b.rate - a.rate);
      } else if (targetSortMode === 'rate_asc') {
        processed.sort((a, b) => a.rate - b.rate);
      } else if (targetSortMode === 'name_asc') {
        processed.sort((a, b) => a.facility.localeCompare(b.facility));
      } else if (targetSortMode === 'target_desc') {
        processed.sort((a, b) => b.target - a.target);
      }

      // Update KPI counters inside target achievement card
      const totalTarget = processed.reduce((sum, item) => sum + item.target, 0);
      const totalActual = processed.reduce((sum, item) => sum + item.actual, 0);
      const overallRate = totalTarget > 0 ? (totalActual / totalTarget * 100) : 0;
      const facilitiesAchievedCount = processed.filter(item => item.rate >= 100).length;
      
      const metricLabels = {
        penta1: 'Penta-1',
        bcg: 'BCG',
        mr1: 'MR-1',
        infants: 'Infants',
        total_beneficiaries: 'Beneficiaries'
      };
      const currentMetricLabel = metricLabels[targetMetric] || 'Actual';

      const targetKpiRow = document.getElementById('target-kpi-row');
      if (targetKpiRow) {
        targetKpiRow.innerHTML = `
          <div class="kpi bl">
            <div>
              <div class="kpi-lbl">Total Target</div>
              <div class="kpi-val">${Math.round(totalTarget).toLocaleString()}</div>
            </div>
            <div class="kpi-sub">${targetPeriod === 'yearly' ? 'Yearly' : 'Monthly'} Target Total</div>
          </div>
          <div class="kpi gr">
            <div>
              <div class="kpi-lbl">Total ${currentMetricLabel} Achieved</div>
              <div class="kpi-val">${totalActual.toLocaleString()}</div>
            </div>
            <div class="kpi-sub">Total actual vaccinations</div>
          </div>
          <div class="kpi ${overallRate >= 100 ? 'gr' : overallRate >= 80 ? 'am' : 're'}">
            <div>
              <div class="kpi-lbl">Overall Achievement Rate</div>
              <div class="kpi-val">${overallRate.toFixed(1)}%</div>
            </div>
            <div class="kpi-sub">Based on ${targetSource === 'fixed' ? 'Fixed ELA' : 'Custom'} targets</div>
          </div>
          <div class="kpi bl">
            <div>
              <div class="kpi-lbl">Facilities Achieved Target</div>
              <div class="kpi-val">${facilitiesAchievedCount} <span style="font-size:14px; font-weight:600; color:var(--color-text-secondary)">/ ${processed.length}</span></div>
            </div>
            <div class="kpi-sub">Achievement rate ≥ 100%</div>
          </div>
        `;
      }

      // Resize chart container
      const targetWrapper = document.getElementById('c-target-wrapper');
      if (targetWrapper) {
        const parentWidth = targetWrapper.parentElement.clientWidth || 600;
        const dynamicWidth = Math.max(parentWidth, processed.length * 60);
        targetWrapper.style.width = `${dynamicWidth}px`;
      }

      // Draw Chart
      if (chartTargetAchievement) chartTargetAchievement.destroy();

      const ctx = document.getElementById('c-target-achievement');
      if (!ctx) return;

      const actColors = processed.map(item => {
        if (item.rate >= 100) return '#10b981'; // green
        if (item.rate >= 80) return '#f59e0b'; // orange
        return '#ef4444'; // red
      });

      chartTargetAchievement = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: processed.map(item => item.shortName),
          datasets: [
            {
              label: 'Target',
              data: processed.map(item => item.target),
              backgroundColor: '#cbd5e1',
              borderRadius: 4,
              categoryPercentage: 0.8,
              barPercentage: 0.8
            },
            {
              label: `${currentMetricLabel} Actual`,
              data: processed.map(item => item.actual),
              backgroundColor: actColors,
              borderRadius: 4,
              categoryPercentage: 0.8,
              barPercentage: 0.8
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                font: { size: 11, weight: 'bold' }
              }
            },
            datalabels: {
              anchor: 'end',
              align: 'top',
              font: { size: 8, weight: 'bold' },
              color: '#475569',
              formatter: (v, context) => {
                if (context.datasetIndex === 1) {
                  const rate = processed[context.dataIndex].rate;
                  return rate > 0 ? `${rate.toFixed(0)}%` : '0%';
                }
                return null;
              }
            }
          },
          scales: {
            x: {
              ticks: { font: { size: 9 }, color: '#64748b', maxRotation: 45, autoSkip: false },
              grid: { display: false }
            },
            y: {
              grace: '15%',
              ticks: { font: { size: 10 }, color: '#64748b' },
              grid: { color: '#f1f5f9' }
            }
          }
        }
      });
    }
    window.renderTargetAchievement = renderTargetAchievement;


    // ── Target Editor Modal ──────────────────────────────────────────────────

    // Staging object: holds edits made inside the modal before the user saves
    let modalStagedTargets = {};

    function openTargetEditor() {
      // Deep-copy current custom targets into the staging object
      modalStagedTargets = Object.assign({}, customTargets);

      // Render the modal table
      renderModalTable();
      updateModalTotals();

      // Clear search
      const searchEl = document.getElementById('modal-facility-search');
      if (searchEl) searchEl.value = '';

      // Show modal
      const modal = document.getElementById('target-editor-modal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }
    window.openTargetEditor = openTargetEditor;

    function closeTargetEditor() {
      const modal = document.getElementById('target-editor-modal');
      if (modal) modal.style.display = 'none';
      document.body.style.overflow = '';
      modalStagedTargets = {};
    }
    window.closeTargetEditor = closeTargetEditor;

    // Close modal when clicking the dark overlay behind it
    function onModalOverlayClick(event) {
      if (event.target.id === 'target-editor-modal') closeTargetEditor();
    }
    window.onModalOverlayClick = onModalOverlayClick;

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const modal = document.getElementById('target-editor-modal');
        if (modal && modal.style.display !== 'none') closeTargetEditor();
      }
    });

    function renderModalTable(filter) {
      const tbody = document.getElementById('modal-target-body');
      if (!tbody) return;

      const q = (filter || '').toLowerCase().trim();

      // Deduplicate: DATA.facilities has one row per facility-month;
      // we only want one entry per unique facility name.
      const seenFacilities = new Set();
      const uniqueFacilities = DATA.facilities.filter(f => {
        const key = f.facility;
        if (seenFacilities.has(key)) return false;
        seenFacilities.add(key);
        return true;
      });

      // Build rows from deduplicated facility list
      let rows = uniqueFacilities.map((f, idx) => ({
        idx: idx + 1,
        facility: f.facility,
        block: f.sub_district,
        ela: getFixedTarget(f.facility),
        custom: modalStagedTargets[f.facility] !== undefined
          ? modalStagedTargets[f.facility]
          : getFixedTarget(f.facility)
      }));

      // Apply search filter
      if (q) {
        rows = rows.filter(r =>
          r.facility.toLowerCase().includes(q) || r.block.toLowerCase().includes(q)
        );
      }

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="no-data" style="padding:2rem;">No facilities match your search.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map((r, i) => {
        const diff = r.custom - r.ela;
        const diffText = diff === 0 ? '=' : (diff > 0 ? `+${diff}` : `${diff}`);
        const diffCls = diff === 0 ? '#10b981' : diff > 0 ? '#f59e0b' : '#ef4444';
        const rowBg = (i % 2 === 0) ? '' : 'background:var(--color-background-secondary);';

        return `<tr style="${rowBg}">
          <td style="color:var(--color-text-tertiary); font-size:11px;">${r.idx}</td>
          <td>
            <div style="font-weight:700; font-size:13px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.facility}">${r.facility}</div>
          </td>
          <td><span class="pill pb" style="font-size:10px;">${r.block}</span></td>
          <td style="text-align:right; font-weight:600; color:var(--color-text-secondary);">${r.ela}</td>
          <td style="text-align:right;">
            <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
              <div style="position:relative; width:115px;">
                <input
                  type="number"
                  class="target-input modal-target-input"
                  data-facility="${r.facility.replace(/"/g, '&quot;')}"
                  value="${r.custom}"
                  min="0"
                  oninput="onModalInputChange(this)"
                  style="width:100%; font-size:14px; padding:6px 10px; text-align:right; border-radius:var(--border-radius-sm); border:1.5px solid var(--color-border-secondary);"
                >
              </div>
              <button class="modal-reset-btn" onclick="modalResetSingle('${r.facility.replace(/'/g, "\\'")}', this)" title="Reset to ELA target">
                <i class="ti ti-refresh" style="font-size:11px;"></i>
              </button>
            </div>
          </td>
          <td style="text-align:right;">
            <span class="pill" style="background:${diffCls}22; color:${diffCls}; border:1px solid ${diffCls}44; font-size:11px; font-weight:700;">${diffText}</span>
          </td>
        </tr>`;
      }).join('');
    }

    function onModalInputChange(inputEl) {
      const facility = inputEl.dataset.facility;
      let val = parseFloat(inputEl.value);
      if (isNaN(val) || val < 0) val = 0;
      modalStagedTargets[facility] = Math.round(val);
      updateModalTotals();
      updateModalRowDiff(inputEl, facility);
    }
    window.onModalInputChange = onModalInputChange;

    function updateModalRowDiff(inputEl, facility) {
      const ela    = getFixedTarget(facility);
      const custom = modalStagedTargets[facility] !== undefined ? modalStagedTargets[facility] : ela;
      const diff   = custom - ela;
      const diffText = diff === 0 ? '=' : (diff > 0 ? `+${diff}` : `${diff}`);
      const diffCls  = diff === 0 ? '#10b981' : diff > 0 ? '#f59e0b' : '#ef4444';
      const td = inputEl.closest('tr').querySelector('td:last-child');
      if (td) {
        td.innerHTML = `<span class="pill" style="background:${diffCls}22; color:${diffCls}; border:1px solid ${diffCls}44; font-size:11px; font-weight:700;">${diffText}</span>`;
      }
    }

    function getUniqueFacilities() {
      const seen = new Set();
      return DATA.facilities.filter(f => {
        if (seen.has(f.facility)) return false;
        seen.add(f.facility);
        return true;
      });
    }

    function modalResetSingle(facilityName, btn) {
      const ela = getFixedTarget(facilityName);
      modalStagedTargets[facilityName] = ela;
      const input = btn.closest('tr').querySelector('.modal-target-input');
      if (input) {
        input.value = ela;
        updateModalRowDiff(input, facilityName);
      }
      updateModalTotals();
    }
    window.modalResetSingle = modalResetSingle;

    function updateModalTotals() {
      const totalCustomEl = document.getElementById('modal-total-custom');
      if (!totalCustomEl) return;
      let total = 0;
      getUniqueFacilities().forEach(f => {
        const val = modalStagedTargets[f.facility] !== undefined
          ? modalStagedTargets[f.facility]
          : getFixedTarget(f.facility);
        total += val;
      });
      totalCustomEl.textContent = total.toLocaleString();
    }

    function filterModalTable() {
      const q = document.getElementById('modal-facility-search').value;
      renderModalTable(q);
    }
    window.filterModalTable = filterModalTable;

    function modalFillFromELA() {
      getUniqueFacilities().forEach(f => {
        modalStagedTargets[f.facility] = getFixedTarget(f.facility);
      });
      const q = document.getElementById('modal-facility-search')?.value || '';
      renderModalTable(q);
      updateModalTotals();
      setModalStatus('All custom targets reset to ELA values.', 'success');
    }
    window.modalFillFromELA = modalFillFromELA;

    function modalClearAll() {
      if (!confirm('Set all custom targets to 0?')) return;
      getUniqueFacilities().forEach(f => { modalStagedTargets[f.facility] = 0; });
      const q = document.getElementById('modal-facility-search')?.value || '';
      renderModalTable(q);
      updateModalTotals();
      setModalStatus('All custom targets cleared to 0.', 'warn');
    }
    window.modalClearAll = modalClearAll;

    function saveTargetEditorChanges() {
      Object.assign(customTargets, modalStagedTargets);
      saveCustomTargets();
      closeTargetEditor();
      renderTable();
      renderTargetAchievement();
    }
    window.saveTargetEditorChanges = saveTargetEditorChanges;

    function exportTargetsCSV() {
      const rows = ['Facility Name,Block,ELA Target,Custom Target'];
      getUniqueFacilities().forEach(f => {
        const ela    = getFixedTarget(f.facility);
        const custom = modalStagedTargets[f.facility] !== undefined
          ? modalStagedTargets[f.facility]
          : (customTargets[f.facility] !== undefined ? customTargets[f.facility] : ela);
        rows.push(`"${f.facility}","${f.sub_district}",${ela},${custom}`);
      });
      const link = document.createElement('a');
      link.href     = 'data:text/csv;charset=utf-8,' + encodeURI(rows.join('\n'));
      link.download = 'Custom_Targets_Bhagalpur.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setModalStatus('CSV exported successfully.', 'success');
    }
    window.exportTargetsCSV = exportTargetsCSV;

    function importTargetsCSV(inputEl) {
      const file = inputEl.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        const text  = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { setModalStatus('CSV appears empty or invalid.', 'error'); return; }

        const header      = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
        const facilityIdx = header.findIndex(h => h.includes('facility'));
        const customIdx   = header.findIndex(h => h.includes('custom'));

        if (facilityIdx === -1 || customIdx === -1) {
          setModalStatus('CSV must have "Facility Name" and "Custom Target" columns.', 'error');
          inputEl.value = '';
          return;
        }

        let imported = 0, skipped = 0;
        lines.slice(1).forEach(line => {
          const cols        = line.match(/(".*?"|[^,]+)/g) || [];
          const facilityRaw = (cols[facilityIdx] || '').replace(/"/g, '').trim();
          const customVal   = parseInt((cols[customIdx] || '').replace(/"/g, '').trim(), 10);
          if (!facilityRaw || isNaN(customVal)) { skipped++; return; }
          const matched = DATA.facilities.find(f =>
            f.facility.replace(/\s+/g, ' ').trim().toLowerCase() ===
            facilityRaw.replace(/\s+/g, ' ').trim().toLowerCase()
          );
          if (matched) { modalStagedTargets[matched.facility] = Math.max(0, customVal); imported++; }
          else skipped++;
        });

        const q = document.getElementById('modal-facility-search')?.value || '';
        renderModalTable(q);
        updateModalTotals();
        setModalStatus(
          `Imported ${imported} facilities.${skipped > 0 ? ' ' + skipped + ' skipped.' : ''}`,
          imported > 0 ? 'success' : 'warn'
        );
        inputEl.value = '';
      };
      reader.readAsText(file);
    }
    window.importTargetsCSV = importTargetsCSV;

    function setModalStatus(msg, type) {
      const el = document.getElementById('modal-status-msg');
      if (!el) return;
      const colors = { success: 'var(--color-success)', warn: 'var(--color-warning)', error: 'var(--color-danger)' };
      el.textContent = msg;
      el.style.color = colors[type] || 'var(--color-text-tertiary)';
      setTimeout(() => { if (el) el.textContent = ''; }, 4000);
    }

    // ── Initialize Dashboard ─────────────────────────────────────────────────
    ensurePenta2Data();
    populateBlockFilter();
    setupFileUploader();
    initializeCustomTargets();
    changeViewLevel('facility');
    renderKPIs();
