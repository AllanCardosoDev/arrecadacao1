// Utility functions for currency formatting and parsing
function parseBRL(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    let cleanStr = value.replace('R$', '').trim();
    cleanStr = cleanStr.replace(/\./g, '');
    cleanStr = cleanStr.replace(',', '.');
    return parseFloat(cleanStr);
}

function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatBRLNoCents(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

// Global charts instances to allow updating if necessary
let charts = {};

async function initDashboard() {
    try {
        const response = await fetch('https://docs.google.com/spreadsheets/d/1oY6qsppzbLhUPrwwj9279tYsFszgBHC_/export?format=csv&gid=1088293995');
        if (!response.ok) throw new Error('Não foi possível carregar o CSV');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                processData(results.data);
            }
        });
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        document.getElementById('kpiHistorico').innerText = "Erro ao carregar";
        document.getElementById('kpi2026').innerText = "Erro ao carregar";
    }
}

function processData(data) {
    let totalHistorico = 0;
    let arrecadacaoPorAno = {};
    let areaChartData = {}; 
    
    // Ordered months for correct chart rendering
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const anos = [];

    data.forEach(row => {
        const mes = row['MÊS'] ? row['MÊS'].trim() : null;
        const ano = row['ANO'] ? row['ANO'].trim() : null;
        const valorStr = row['VALOR'];
        
        if (!mes || !ano || !valorStr) return;

        const valor = parseBRL(valorStr);
        totalHistorico += valor;
        
        if (!arrecadacaoPorAno[ano]) {
            arrecadacaoPorAno[ano] = 0;
            anos.push(ano);
            areaChartData[ano] = new Array(12).fill(null);
        }
        
        arrecadacaoPorAno[ano] += valor;
        
        const mesIndex = meses.indexOf(mes);
        if (mesIndex !== -1) {
            areaChartData[ano][mesIndex] = valor;
        }
    });

    anos.sort(); // Sort years ascending

    // Projection for missing months of 2026 using YTD Seasonal Ratio
    // This compares the year-to-date performance of 2026 against 2025
    // and applies that ratio to the remaining months of 2025 to project 2026.
    const targetYear = '2026';
    const previousYear = '2025';
    
    let total2026Actual = arrecadacaoPorAno[targetYear] || 0;
    let total2026Projected = 0;
    
    if (areaChartData[targetYear] && areaChartData[previousYear]) {
        let ytdTarget = 0;
        let ytdPrevious = 0;
        let lastActualMonthIndex = -1;

        // Find YTD sums
        for (let i = 0; i < 12; i++) {
            if (areaChartData[targetYear][i] !== null && areaChartData[targetYear][i] !== undefined && areaChartData[targetYear][i] > 0) {
                ytdTarget += areaChartData[targetYear][i];
                ytdPrevious += areaChartData[previousYear][i] || 0;
                lastActualMonthIndex = i;
            }
        }

        // Calculate ratio
        const trendRatio = (ytdPrevious > 0) ? (ytdTarget / ytdPrevious) : 1;

        if (!areaChartData[targetYear + '_projected']) {
            areaChartData[targetYear + '_projected'] = new Array(12).fill(false);
        }

        // Project remaining months
        for (let i = lastActualMonthIndex + 1; i < 12; i++) {
            if (!areaChartData[targetYear][i]) {
                const baseValue = areaChartData[previousYear][i] || 0;
                const predictedVal = baseValue * trendRatio;
                
                areaChartData[targetYear][i] = predictedVal;
                areaChartData[targetYear + '_projected'][i] = true;
                arrecadacaoPorAno[targetYear] = (arrecadacaoPorAno[targetYear] || 0) + predictedVal;
                totalHistorico += predictedVal;
                total2026Projected += predictedVal;
            }
        }
    }

    const currentYear = '2026';
    const total2026 = arrecadacaoPorAno[currentYear] || 0;
    const meta2026 = 3000000;

    // Update the DOM KPIs
    document.getElementById('kpiHistorico').innerText = formatBRL(totalHistorico);
    document.getElementById('kpi2026').innerHTML = `<div style="display: flex; flex-direction: column; text-align: center; line-height: 1.2;"><span style="color: #3498db; font-weight: 600;">${formatBRL(total2026Actual)}</span><span style="font-size: 0.9rem; color: #10b981; margin-top: 4px;">+ ${formatBRL(total2026Projected)} (Proj.)</span></div>`;
    document.getElementById('gaugeValue').innerHTML = `<div style="color: #3498db; line-height: 1; font-weight: 600;">${formatBRL(total2026Actual)}</div><div style="font-size: 0.85rem; color: #10b981; font-weight: 600; margin-top: 5px;">+ ${formatBRL(total2026Projected)} Projetado</div>`;

    renderCharts(anos, arrecadacaoPorAno, meses, areaChartData, total2026, meta2026, total2026Actual, total2026Projected);
    renderTable(anos, meses, areaChartData);
}

function renderCharts(anos, arrecadacaoPorAno, meses, areaChartData, total2026, meta2026, total2026Actual, total2026Projected) {
    // Set global Chart.js defaults for warm skin theme
    Chart.defaults.color = '#665248';
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.borderColor = 'rgba(139, 90, 76, 0.15)';

    const masterColors = ['#34495e', '#9b59b6', '#e67e22', '#e91e63', '#673ab7', '#f1c40f', '#e74c3c', '#27ae60', '#d35400', '#2ecc71', '#3498db'];
    const getColor = (index) => masterColors[index % masterColors.length];

    // 1. Gauge Chart
    const ctxGauge = document.getElementById('gaugeChart').getContext('2d');
    
    const percentCompleteActual = Math.min((total2026Actual / meta2026) * 100, 100);
    const percentCompleteProj = Math.min((total2026Projected / meta2026) * 100, 100);
    const percentRemaining = Math.max(100 - percentCompleteActual - percentCompleteProj, 0);
    
    charts.gauge = new Chart(ctxGauge, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [percentCompleteActual, percentCompleteProj, percentRemaining], 
                backgroundColor: ['#3498db', '#10b981', '#f1c40f'], // Blue Actual, Green Proj, Yellow Remaining
                borderWidth: 0,
                cutout: '75%',
                circumference: 180,
                rotation: -90,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { bottom: 20 } },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        },
        plugins: [{
            id: 'gaugeNeedle',
            afterDatasetsDraw(chart) {
                const { ctx, data, chartArea: { width, height } } = chart;
                ctx.save();
                
                const centerX = width / 2;
                const centerY = chart.getDatasetMeta(0).data[0].y;
                const innerRadius = chart.getDatasetMeta(0).data[0].innerRadius;
                const outerRadius = chart.getDatasetMeta(0).data[0].outerRadius;
                const radius = (innerRadius + outerRadius) / 2;

                // 1. Draw Needle (pointing to the actual value)
                const percentActual = Math.min((total2026Actual / meta2026) * 100, 100);
                const angle = Math.PI + (percentActual / 100) * Math.PI;
                
                ctx.translate(centerX, centerY);
                ctx.rotate(angle);
                
                // Needle line
                ctx.beginPath();
                ctx.moveTo(0, -5);
                ctx.lineTo(innerRadius - 10, 0);
                ctx.lineTo(0, 5);
                ctx.fillStyle = '#3498db'; // Blue needle matching image
                ctx.fill();
                
                // Center dot
                ctx.beginPath();
                ctx.arc(0, 0, 10, 0, Math.PI * 2);
                ctx.fillStyle = '#3498db';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                ctx.restore();

                // 2. Draw Markers and Labels
                ctx.save();
                ctx.translate(centerX, centerY);
                
                const drawMarker = (percent, label) => {
                    const markerAngle = Math.PI + (percent / 100) * Math.PI;
                    const x = Math.cos(markerAngle) * (outerRadius + 15);
                    const y = Math.sin(markerAngle) * (outerRadius + 15);
                    
                    ctx.font = 'bold 10px Inter, sans-serif';
                    ctx.fillStyle = '#665248';
                    ctx.textAlign = 'center';
                    ctx.fillText(label, x, y);
                    
                    // Small line
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(markerAngle) * outerRadius, Math.sin(markerAngle) * outerRadius);
                    ctx.lineTo(Math.cos(markerAngle) * (outerRadius + 8), Math.sin(markerAngle) * (outerRadius + 8));
                    ctx.strokeStyle = 'rgba(139, 90, 76, 0.2)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                };

                drawMarker(60, '60%');
                drawMarker(80, '80%');
                
                // End labels
                ctx.font = '9px Inter, sans-serif';
                ctx.fillStyle = '#665248';
                ctx.textAlign = 'left';
                ctx.fillText('R$ 0', -outerRadius - 5, 15);
                ctx.textAlign = 'right';
                ctx.fillText('R$ ' + (meta2026/1000000).toFixed(3) + 'M', outerRadius + 5, 15);
                
                ctx.restore();
            }
        }]
    });

    // 2. Bar Chart
    const ctxBar = document.getElementById('barChart').getContext('2d');
    
    // Bar colors based on global index
    const barColorsActual = anos.map((ano, index) => getColor(index));

    const barDataActual = anos.map(ano => ano === '2026' ? total2026Actual : arrecadacaoPorAno[ano]);
    const barDataProjected = anos.map(ano => ano === '2026' ? total2026Projected : 0);
    
    charts.bar = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: anos,
            datasets: [
                {
                    label: 'Arrecadação Atual',
                    data: barDataActual,
                    backgroundColor: barColorsActual,
                    borderRadius: 4,
                    barPercentage: 0.7
                },
                {
                    label: 'Projeção',
                    data: barDataProjected,
                    backgroundColor: '#10b981', // Vibrant Green for projection
                    borderRadius: 4,
                    barPercentage: 0.7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 16, 21, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#ffd54f',
                    callbacks: {
                        label: function(context) {
                            return formatBRL(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: 'rgba(139, 90, 76, 0.12)' },
                    ticks: {
                        color: '#665248',
                        callback: function(value) {
                            if (value >= 1000000) return 'R$ ' + (value / 1000000).toFixed(1) + 'M';
                            if (value >= 1000) return 'R$ ' + (value / 1000).toFixed(0) + 'k';
                            return 'R$ ' + value;
                        }
                    }
                },
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: '#665248' }
                }
            }
        },
        plugins: [{
            id: 'bar_datalabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    meta.data.forEach((element, index) => {
                        // Only show label on the top dataset or total
                        if (datasetIndex === 0 && barDataProjected[index] > 0) return; // Skip actual if there is a projection on top
                        
                        const totalVal = barDataActual[index] + barDataProjected[index];
                        const text = formatBRLNoCents(totalVal);
                        
                        ctx.fillStyle = barDataProjected[index] > 0 ? '#10b981' : '#33221b';
                        ctx.font = 'bold 9px Inter, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(text, element.x, element.y - 5);
                    });
                });
                ctx.restore();
            }
        }]
    });

    // 3. Area Chart
    const ctxArea = document.getElementById('areaChart').getContext('2d');
    
    // Distinct colors synced with masterColors
    const datasets = anos.map((ano, index) => {
        const color = getColor(index);
        return {
            label: ano,
            data: areaChartData[ano],
            borderColor: color,
            backgroundColor: color + '99', // Higher opacity for stacked effect
            borderWidth: 1,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1,
            pointRadius: 2,
            pointHoverRadius: 5
        };
    });

    charts.area = new Chart(ctxArea, {
        type: 'line',
        data: {
            labels: meses,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 15,
                        color: '#33221b',
                        font: { size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 16, 21, 0.95)',
                    titleColor: '#fff',
                    bodySpacing: 4,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatBRL(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: 'rgba(139, 90, 76, 0.12)' },
                    ticks: {
                        color: '#665248',
                        callback: function(value) {
                            if (value >= 1000000) return 'R$ ' + (value / 1000000).toFixed(1) + 'M';
                            if (value >= 1000) return 'R$ ' + (value / 1000).toFixed(0) + 'k';
                            return 'R$ ' + value;
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#665248' }
                }
            }
        },
        plugins: [{
            id: 'area_datalabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    if (meta.hidden) return;
                    meta.data.forEach((element, index) => {
                        const val = dataset.data[index];
                        if (val === null || val === undefined || val === 0) return;
                        
                        const text = formatBRLNoCents(val);
                        
                        ctx.font = 'bold 8px Inter, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        
                        // Outline for contrast on color bands
                        ctx.strokeStyle = 'rgba(252, 246, 240, 0.9)';
                        ctx.lineWidth = 3;
                        ctx.strokeText(text, element.x, element.y - 4);
                        
                        if (dataset.label === '2026' && areaChartData['2026_projected'] && areaChartData['2026_projected'][index]) {
                            ctx.fillStyle = '#10b981'; // Vibrant Green for projected
                        } else {
                            ctx.fillStyle = '#33221b';
                        }
                        ctx.fillText(text, element.x, element.y - 4);
                    });
                });
                ctx.restore();
            }
        }]
    });
}

function renderTable(anos, meses, areaChartData) {
    const thead = document.querySelector('#arrecadacaoTable thead');
    const tbody = document.querySelector('#arrecadacaoTable tbody');
    
    if (!thead || !tbody) return;

    // Create table header
    let headerHtml = '<tr><th>ANO</th>';
    meses.forEach(mes => {
        headerHtml += `<th>${mes}</th>`;
    });
    headerHtml += '<th>TOTAL</th></tr>';
    thead.innerHTML = headerHtml;

    const masterColors = ['#34495e', '#9b59b6', '#e67e22', '#e91e63', '#673ab7', '#f1c40f', '#e74c3c', '#27ae60', '#d35400', '#2ecc71', '#3498db'];
    const getColor = (index) => masterColors[index % masterColors.length];

    // Create table rows (descending order of years)
    let bodyHtml = '';
    const sortedAnosDesc = [...anos].reverse();
    
    sortedAnosDesc.forEach(ano => {
        const index = anos.indexOf(ano);
        const color = getColor(index);
        
        let rowHtml = `<tr>
            <td class="year-cell">
                <span class="year-color-indicator" style="background-color: ${color};"></span>
                <strong>${ano}</strong>
            </td>`;
        
        let yearTotal = 0;
        
        meses.forEach((mes, mIndex) => {
            const val = areaChartData[ano][mIndex];
            const isProjected = areaChartData[ano + '_projected'] && areaChartData[ano + '_projected'][mIndex];
            
            if (val !== null && val !== undefined) {
                yearTotal += val;
                const cssClass = isProjected ? "value-cell projected-val" : "value-cell";
                const displayVal = formatBRL(val);
                rowHtml += `<td class="${cssClass}" data-label="${mes}">${displayVal}</td>`;
            } else {
                rowHtml += `<td class="value-cell empty" data-label="${mes}">-</td>`;
            }
        });
        
        rowHtml += `<td class="total-cell"><strong>${formatBRL(yearTotal)}</strong></td></tr>`;
        bodyHtml += rowHtml;
    });
    
    tbody.innerHTML = bodyHtml;
}

document.addEventListener('DOMContentLoaded', initDashboard);
