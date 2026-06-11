    Chart.register(ChartDataLabels);

    let curLevel = 'facility'; // 'facility' or 'hsc'
    let curView = 'active'; // 'active', 'all', 'inactive'
    let sortField = 'penta1';
    let sortAsc = false;
    let gradeFilter = 'all';
    let selectedMapBlock = "";

    // Active & Inactive computed sets
    let currentDataset = [];
    let active = [];
    let inactive = [];

    // Chart.js instances
    let chartPenta = null;
    let chartBcg = null;
    let chartDropout = null;
    let chartLoad = null;

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
      link.setAttribute("download", `Immunization_Dashboard_Report_${curLevel}_${curView}.csv`);
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
                bcg: 0, hepb: 0, opv0: 0, opv1: 0, penta1: 0, penta3: 0, mr1: 0, mr2: 0,
                pw_vacc: 0, infants: 0, children_gt1: 0
              };
            }
            let f = facMap[facilityName];
            if (siteName) f.sitesSet.add(siteName);
            f.sessions_planned += planned;
            f.sessions_held += held;
            f.bcg += bcg; f.hepb += hepb; f.opv0 += opv0; f.opv1 += opv1; f.penta1 += penta1; f.penta3 += penta3; f.mr1 += mr1; f.mr2 += mr2;
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
                bcg: 0, hepb: 0, opv0: 0, opv1: 0, penta1: 0, penta3: 0, mr1: 0, mr2: 0,
                pw_vacc: 0, infants: 0, children_gt1: 0
              };
            }
            let h = hscMap[hscName];
            if (siteName) h.sitesSet.add(siteName);
            h.sessions_planned += planned;
            h.sessions_held += held;
            h.bcg += bcg; h.hepb += hepb; h.opv0 += opv0; h.opv1 += opv1; h.penta1 += penta1; h.penta3 += penta3; h.mr1 += mr1; h.mr2 += mr2;
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

      // Update titles
      document.getElementById('chart-penta-title').innerHTML = `<i class="ti ti-chart-bar" style="margin-right:6px; vertical-align:middle; color:var(--color-primary)"></i>Penta-1 coverage by ${lvl === 'facility' ? 'facility' : 'HSC'} (top 16 active)`;
      document.getElementById('chart-bcg-title').innerHTML = `<i class="ti ti-chart-arrows" style="margin-right:6px; vertical-align:middle; color:var(--color-warning)"></i>BCG vs Penta-1 — ${lvl === 'facility' ? 'facility' : 'HSC'} gap analysis`;
      document.getElementById('chart-dropout-title').innerHTML = `<i class="ti ti-chart-area" style="margin-right:6px; vertical-align:middle; color:var(--color-danger)"></i>Dropout — Penta-1 → Penta-3 (${lvl === 'facility' ? 'active facilities' : 'active HSCs'})`;
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
      renderCharts(distAvg);
      renderScorecards();
      updateMapColors();
      updateRiskAnalysis();
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

      const tbody = document.getElementById('fac-body');
      if (!data.length) { 
        tbody.innerHTML = `<tr><td colspan="14" class="no-data"><i class="ti ti-ban" style="font-size:24px; display:block; margin-bottom:8px; color:var(--color-text-tertiary)"></i>No items match the search criteria</td></tr>`; 
        document.getElementById('tbl-count').textContent = `Showing 0 items`;
        return; 
      }

      tbody.innerHTML = data.map(f => {
        const g = grade(f);
        const gpill = g ? `<span class="sc-score ${g}" style="position:static;display:inline-flex;width:24px;height:24px;font-size:11px">${g}</span>` : '-';
        const spct = f.session_pct >= 100 ? 'pg' : f.session_pct >= 98 ? 'pa' : 'pr';
        const displayName = curLevel === 'facility' ? f.facility : f.hsc;
        const blockName = f.sub_district;
        
        // Progress bar scaling
        const maxBCGVal = curLevel === 'facility' ? 8 : 1.2;

        return `<tr>
          <td style="font-weight:700;max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${displayName}">${displayName}</td>
          <td><span class="pill pb">${blockName}</span></td>
          <td>${f.sites}</td>
          <td><strong>${f.sessions_held}</strong><span style="color:var(--color-text-tertiary)">/${f.sessions_planned}</span></td>
          <td><span class="pill ${spct}">${f.session_pct.toFixed(0)}%</span></td>
          <td>${f.avg_per_session.toFixed(1)}</td>
          <td><strong>${f.penta1.toLocaleString()}</strong></td>
          <td>${f.penta3.toLocaleString()}</td>
          <td><div class="bar-w"><span style="min-width:35px">${f.bcg}</span><div class="bar-t"><div class="bar-f" style="width:${Math.min(f.bcg / maxBCGVal, 100)}%;background:${f.bcg < (maxBCGVal*10)?'var(--color-danger)':f.bcg < (maxBCGVal*30)?'var(--color-warning)':'var(--color-success)'}"></div></div></div></td>
          <td>${f.mr1}</td>
          <td>${f.mr2}</td>
          <td>${f.dropout_penta !== null ? `<span class="pill ${doColor(f.dropout_penta)}">${doText(f.dropout_penta)}</span>` : '—'}</td>
          <td>${f.dropout_mr !== null ? `<span class="pill ${doColor(f.dropout_mr)}">${doText(f.dropout_mr)}</span>` : '—'}</td>
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

    function renderCharts(distAvg) {
      if (chartPenta) chartPenta.destroy();
      if (chartBcg) chartBcg.destroy();
      if (chartDropout) chartDropout.destroy();
      if (chartLoad) chartLoad.destroy();

      const top16 = active.slice(0, 16);
      const displayNameOf = f => curLevel === 'facility' ? f.facility : f.hsc;
      
      const shortName = n => {
        let name = displayNameOf(n);
        name = name.replace(/ CHC| PHC| UPHC| HSC/g, '');
        name = name.replace('LNJPN SADAR HOSPITAL BHAGALPUR', 'LNJPN Sadar');
        name = name.replace('Jawaharlal Nehru Medical College and Hospital  Bgp', 'JLNMCH');
        return name.substring(0, 12);
      };

      // 1. Penta Chart
      chartPenta = new Chart(document.getElementById('c-penta'), {
        type: 'bar',
        data: {
          labels: top16.map(f => shortName(f)),
          datasets: [
            { label: 'Penta-1', data: top16.map(f => f.penta1), backgroundColor: '#2563eb', borderRadius: 4, stack: 's' },
            { label: 'Penta-3', data: top16.map(f => f.penta3), backgroundColor: '#10b981', borderRadius: 4, stack: 's2' }
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
              formatter: (v) => v > 0 ? v : ''
            }
          },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#64748b', maxRotation: 45, autoSkip: false }, grid: { display: false } },
            y: { grace: '12%', ticks: { font: { size: 10 }, color: '#64748b' }, grid: { color: '#f1f5f9' } }
          }
        }
      });

      // 2. BCG vs Penta Chart
      const sorted_bcg = [...active].sort((a, b) => b.penta1 - a.penta1).slice(0, 14);
      chartBcg = new Chart(document.getElementById('c-bcg'), {
        type: 'bar',
        data: {
          labels: sorted_bcg.map(f => shortName(f)),
          datasets: [
            { label: 'BCG', data: sorted_bcg.map(f => f.bcg), backgroundColor: '#f59e0b', borderRadius: 4 },
            { label: 'Penta-1', data: sorted_bcg.map(f => f.penta1), backgroundColor: '#2563eb', borderRadius: 4 }
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
              formatter: (v) => v > 0 ? v : ''
            },
            tooltip: {
              callbacks: {
                afterBody: items => {
                  const d = sorted_bcg[items[0].dataIndex];
                  return 'BCG–P1 Gap: ' + (d.bcg - d.penta1);
                }
              }
            }
          },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#64748b', maxRotation: 45, autoSkip: false }, grid: { display: false } },
            y: { grace: '12%', ticks: { font: { size: 10 }, color: '#64748b' }, grid: { color: '#f1f5f9' } }
          }
        }
      });

      // 3. Dropout Chart
      const act_do = active.filter(f => f.dropout_penta !== null);
      const doColors = act_do.map(f => f.dropout_penta > 10 ? '#ef4444' : f.dropout_penta >= 0 ? '#f59e0b' : '#10b981');
      
      chartDropout = new Chart(document.getElementById('c-dropout'), {
        type: 'bar',
        data: {
          labels: act_do.slice(0, 16).map(f => shortName(f)),
          datasets: [{ label: 'Dropout %', data: act_do.slice(0, 16).map(f => f.dropout_penta), backgroundColor: doColors.slice(0, 16), borderRadius: 4, borderSkipped: false }]
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
      const sortedLoad = [...active].sort((a, b) => b.avg_per_session - a.avg_per_session).slice(0, 16);
      const parsedDistAvg = parseFloat(distAvg);

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

    // Initialize Dashboard Level
    populateBlockFilter();
    setupFileUploader();
    changeViewLevel('facility');
    renderKPIs();

