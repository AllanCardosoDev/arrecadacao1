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
        const response = await fetch('arrecadacao.csv');
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

    // The current/target year based on the image is 2026
    const currentYear = '2026';
    const total2026 = arrecadacaoPorAno[currentYear] || 0;
    const meta2026 = 3000000;

    // Update the DOM KPIs
    document.getElementById('kpiHistorico').innerText = formatBRL(totalHistorico);
    document.getElementById('kpi2026').innerText = formatBRL(total2026);
    document.getElementById('gaugeValue').innerText = formatBRL(total2026);

    renderCharts(anos, arrecadacaoPorAno, meses, areaChartData, total2026, meta2026);
    renderTable(anos, meses, areaChartData);
}

function renderCharts(anos, arrecadacaoPorAno, meses, areaChartData, total2026, meta2026) {
    // Set global Chart.js defaults for warm skin theme
    Chart.defaults.color = '#665248';
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.borderColor = 'rgba(139, 90, 76, 0.15)';

    // 1. Gauge Chart
    const ctxGauge = document.getElementById('gaugeChart').getContext('2d');
    
    const percentComplete = Math.min((total2026 / meta2026) * 100, 100);
    
    charts.gauge = new Chart(ctxGauge, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [60, 20, 20], // Background segments for colors
                backgroundColor: ['#e74c3c', '#f1c40f', '#2ecc71'],
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

                // 1. Draw Needle
                const angle = Math.PI + (percentComplete / 100) * Math.PI;
                
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
    
    // Bar colors based on image
    const barColors = anos.map(ano => {
        if (ano === '2016') return '#e74c3c'; // Red
        if (ano === '2017') return '#34495e'; // Dark Blue
        if (['2018', '2019', '2020'].includes(ano)) return '#3498db'; // Blue
        if (['2021', '2022'].includes(ano)) return '#1abc9c'; // Cyan
        if (['2023', '2024'].includes(ano)) return '#2ecc71'; // Green
        return '#e74c3c'; // 2025, 2026: Red
    });

    const barData = anos.map(ano => arrecadacaoPorAno[ano]);
    
    charts.bar = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: anos,
            datasets: [{
                label: 'Arrecadação',
                data: barData,
                backgroundColor: barColors,
                borderRadius: 4,
                barPercentage: 0.7
            }]
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
            id: 'bar_datalabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    meta.data.forEach((element, index) => {
                        const val = dataset.data[index];
                        if (!val) return;
                        
                        const text = formatBRLNoCents(val);
                        
                        ctx.fillStyle = '#33221b';
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
    
    // Distinct colors for each year matching the image legend as closely as possible
    const areaColors = [
        '#3498db', // 2016: Light Blue
        '#34495e', // 2017: Dark Blue/Gray
        '#e67e22', // 2018: Orange
        '#e91e63', // 2019: Pink
        '#9b59b6', // 2020: Purple
        '#673ab7', // 2021: Deep Purple
        '#f1c40f', // 2022: Yellow
        '#e74c3c', // 2023: Red
        '#27ae60', // 2024: Green
        '#2ecc71', // 2025: Light Green
        '#1abc9c'  // 2026: Cyan
    ];

    const datasets = anos.map((ano, index) => {
        const color = areaColors[index % areaColors.length];
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
                        
                        // Fill text
                        ctx.fillStyle = '#33221b';
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

    const areaColors = [
        '#3498db', '#34495e', '#e67e22', '#e91e63', 
        '#9b59b6', '#673ab7', '#f1c40f', '#e74c3c', 
        '#27ae60', '#2ecc71', '#1abc9c'
    ];

    // Create table rows (descending order of years)
    let bodyHtml = '';
    const sortedAnosDesc = [...anos].reverse();
    
    sortedAnosDesc.forEach(ano => {
        const index = anos.indexOf(ano);
        const color = areaColors[index % areaColors.length];
        
        let rowHtml = `<tr>
            <td class="year-cell">
                <span class="year-color-indicator" style="background-color: ${color};"></span>
                <strong>${ano}</strong>
            </td>`;
        
        let yearTotal = 0;
        
        meses.forEach((mes, mIndex) => {
            const val = areaChartData[ano][mIndex];
            if (val !== null && val !== undefined) {
                yearTotal += val;
                rowHtml += `<td class="value-cell" data-label="${mes}">${formatBRL(val)}</td>`;
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
