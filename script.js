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
}

function renderCharts(anos, arrecadacaoPorAno, meses, areaChartData, total2026, meta2026) {
    // Set global Chart.js defaults for dark theme
    Chart.defaults.color = '#b0bec5';
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';

    // 1. Gauge Chart
    const ctxGauge = document.getElementById('gaugeChart').getContext('2d');
    
    // Create gradient for gauge progress
    let gaugeGradient = ctxGauge.createLinearGradient(0, 0, 300, 0);
    gaugeGradient.addColorStop(0, '#ffd54f'); // Gold
    gaugeGradient.addColorStop(1, '#4caf50'); // Green

    const percentComplete = Math.min((total2026 / meta2026) * 100, 100);
    const remaining = Math.max(0, meta2026 - total2026);

    charts.gauge = new Chart(ctxGauge, {
        type: 'doughnut',
        data: {
            labels: ['Arrecadado', 'Falta'],
            datasets: [{
                data: [total2026, remaining],
                backgroundColor: [gaugeGradient, 'rgba(255, 255, 255, 0.1)'],
                borderWidth: 0,
                cutout: '80%',
                circumference: 180,
                rotation: -90,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + formatBRL(context.raw);
                        }
                    }
                }
            }
        }
    });

    // 2. Bar Chart
    const ctxBar = document.getElementById('barChart').getContext('2d');
    
    let barGradient = ctxBar.createLinearGradient(0, 0, 0, 300);
    barGradient.addColorStop(0, '#e53935'); // Bright red
    barGradient.addColorStop(1, '#1e2028'); // Fade to background

    const barData = anos.map(ano => arrecadacaoPorAno[ano]);
    
    charts.bar = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: anos,
            datasets: [{
                label: 'Arrecadação',
                data: barData,
                backgroundColor: barGradient,
                borderColor: '#e53935',
                borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
                borderRadius: { topLeft: 6, topRight: 6 },
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 16, 21, 0.9)',
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
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) return 'R$ ' + (value / 1000000).toFixed(1) + 'M';
                            if (value >= 1000) return 'R$ ' + (value / 1000).toFixed(0) + 'k';
                            return 'R$ ' + value;
                        }
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    // 3. Area Chart
    const ctxArea = document.getElementById('areaChart').getContext('2d');
    
    // Distinct colors for each year
    const areaColors = [
        '#00bcd4', '#4caf50', '#ff9800', '#9c27b0', 
        '#f44336', '#3f51b5', '#e91e63', '#8bc34a', 
        '#ffeb3b', '#009688', '#ff5722', '#795548'
    ];

    const datasets = anos.map((ano, index) => {
        const color = areaColors[index % areaColors.length];
        return {
            label: ano,
            data: areaChartData[ano],
            borderColor: color,
            backgroundColor: color + '22', // Very transparent fill
            borderWidth: 2,
            fill: true,
            tension: 0.4, // Smooth curve
            pointBackgroundColor: '#0f1015',
            pointBorderColor: color,
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: color
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
                        font: { size: 11 }
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
                    stacked: true, // Stacked to reproduce the overlapping mountain effect
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) return 'R$ ' + (value / 1000000).toFixed(1) + 'M';
                            if (value >= 1000) return 'R$ ' + (value / 1000).toFixed(0) + 'k';
                            return 'R$ ' + value;
                        }
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', initDashboard);
