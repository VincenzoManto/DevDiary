// extension.ts
import * as vscode from 'vscode';
import { CodeTimeTracker, TimeEntry, ErrorEntry } from './tracker';

let tracker: CodeTimeTracker | null = null;
let panel: vscode.WebviewPanel | null = null;

export function activate(context: vscode.ExtensionContext) {
  tracker = new CodeTimeTracker(context);
  let disposable = vscode.commands.registerCommand('codeTime.showDashboard', () => {
    panel = vscode.window.createWebviewPanel('codeTimeDashboard', 'Code Time Tracker Dashboard', vscode.ViewColumn.One, {
      enableScripts: true,
    });

    const entries = tracker!.getEntries();
    const errors = tracker!.getErrors();
    const commits = tracker!.getCommits();
    const comments = tracker!.getComments();
    panel.webview.html = getDashboardHtml(entries, errors, commits, comments);

    panel.webview.onDidReceiveMessage((message) => {
      if (message.type === 'requestData') {
        panel!.webview.postMessage({
          type: 'update',
          entries: tracker!.getEntries(),
          errors: tracker!.getErrors(),
        });
      }
    });

    // Update data when the webview is visible
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        panel!.webview.postMessage({
          type: 'update',
          entries: tracker!.getEntries(),
          errors: tracker!.getErrors(),
        });
      }
    });
  });

  context.subscriptions.push(disposable);

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  // **FIXED**: Il comando della status bar ora corrisponde al comando registrato.
  statusBar.command = 'codeTime.showDashboard'; 
  statusBar.tooltip = 'Show Dev Diary Dashboard';
  statusBar.text = `Today: 00h:00m`; // Testo iniziale
  
  // Mostra immediatamente l'elemento della barra di stato all'attivazione
  // dell'estensione.
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Aggiorna la barra di stato ogni secondo per la massima affidabilità
  function updateStatusBar() {
    if (!tracker) return;
    const entries = tracker!.getEntries();
    const today = new Date();
    today.setHours(0,0,0,0);
    const totalMs = entries.filter(e => e.start >= today.getTime() && e.category !== 'rest')
      .reduce((sum, e) => sum + (e.end - e.start), 0);
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    statusBar.text = `Today coding: ${h.toString().padStart(2,'0')}h:${m.toString().padStart(2,'0')}m`;
    statusBar.show();
    
}
    setTimeout(() => {
      updateStatusBar();
      const statusBarInterval = setInterval(updateStatusBar, 10000);;
  }, 3000);
}

export function deactivate() {
  tracker = null;
  if (panel) {
    panel.dispose();
  }
}

function getDashboardHtml(entries: TimeEntry[], errors: ErrorEntry[], commits: number, comments: number): string {
  const initialData = JSON.stringify(entries);
  const initialErrors = JSON.stringify(errors);
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Time Tracker Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px 24px 0 24px;
            color: var(--vscode-editor-foreground);
        }
        .header h1 {
            font-size: 1.8em;
            margin: 0;
        }
        .header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .header-actions select, .header-actions button {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border: 1px solid #555;
            padding: 8px 12px;
            border-radius: 6px;
        }
        .dashboard { padding: 24px; }
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            margin-bottom: 24px;
        }
        .summary-card {
            background-color: var(--vscode-editor-background);
            border-radius: 12px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border: 1px solid #333;
        }
        .summary-card h2 {
            margin: 0 0 8px 0;
            font-size: 1.2em;
            color: var(--vscode-editor-foreground);
        }
        .summary-card .time {
            font-size: 2.5em;
            font-weight: 700;
            color: var(--vscode-editor-foreground);
        }
        .summary-card .comparison {
            font-size: 0.9em;
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .comparison .up { color: #55b55e; }
        .comparison .down { color: #c43e1d; }

        .main-content {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }
        .chart-section {
            background-color: var(--vscode-editor-background);
            border-radius: 12px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            padding: 20px;
            border: 1px solid #333;
        }
        .chart-section h2 {
            margin-top: 0;
            font-size: 1.2em;
            color: var(--vscode-editor-foreground);
            border-bottom: 1px solid #444;
            padding-bottom: 10px;
        }
        /* 3 columns for larger screens, 2 for medium, 1 for small */
        .chart-grid {
            display: grid;
            gap: 24px;
        }
        @media (min-width: 1200px) {
            .chart-grid {
                grid-template-columns: repeat(3, 1fr);
            }
        }
        @media (min-width: 800px) and (max-width: 1199px) {
            .chart-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        @media (max-width: 799px) {
            .chart-grid {
                grid-template-columns: 1fr;
            }
        }
        .chart-grid .chart {
            border-radius: 12px;
            padding: 20px;
            background: #0005;
            border: 1px solid #333;
        }
        .chart canvas,
        .chart-section canvas {
            max-width: 100%;
            height: 100% !important; /* Ensure charts fill their container */
            width: 100% !important; /* Ensure charts fill their container */
        }

        [_echarts_instance_] {
            height: 90% !important; /* Ensure charts fill their container */
        }
        
        .profile-card {
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 24px;
            border: 1px solid #333;
        }
        .profile-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #007acc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            color: #fff;
        }
        .profile-info { flex: 1; }
        .profile-info h2 {
            margin: 0 0 8px 0;
            font-size: 1.5em;
            color: var(--vscode-editor-foreground);
        }
        .profile-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 4px;
            font-size: 1.2em;
            color: #aaa;
        }
        .profile-row i {
            font-size: 1.2em;
            width: 20px;
            text-align: center;
            color: #007acc;
        }
            /** 2 columsn */
            .profile-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);

            }
        .chart, .chart-section {
            height: 30dvh;
        }
        .profile-label { font-weight: 500; min-width: 100px; }
        .profile-value { font-weight: 600; color: var(--vscode-editor-foreground); }

        .chart div, #dailyStacked div, #activityHeat div, #pieCalendar div, #errorHeat div {
            height: 100%;
        }

    </style>
</head>
<body>
    <div class="header">
        <h1>Coding Statistics</h1>
       
    </div>
    <div class="dashboard">
        <div class="summary-cards">
            <div class="summary-card">
                <h2>Today</h2>
                <div class="time" id="todayTime">0h 0m</div>
                <div class="comparison" id="todayComparison"></div>
            </div>
            <div class="summary-card">
                <h2>This Week (Daily Avg)</h2>
                <div class="time" id="weeklyAvgTime">0h 0m</div>
                <div class="comparison" id="weeklyAvgComparison"></div>
            </div>
            <div class="summary-card">
                <h2>This Month</h2>
                <div class="time" id="monthlyTime">0h 0m</div>
                <div class="comparison" id="monthlyComparison"></div>
            </div>
            <div class="summary-card">
                <h2>Total Coding Time</h2>
                <div class="time" id="totalTime">0h 0m</div>
                <div class="comparison">since tracking began</div>
            </div>
        </div>

        <div class="main-content">
            <div class="profile-card">
                <div class="profile-avatar">👨‍💻</div>
                <div class="profile-info">
                    <h2>Programmer Profile</h2>
                    <div class="profile-grid">
                    <div class="profile-row"><i>🏡</i><span class="profile-label">Work Rhythm:</span> <span class="profile-value" id="workRhythm">-</span></div>
                    <div class="profile-row"><i>✍️</i><span class="profile-label">Coding Style:</span> <span class="profile-value" id="codingStyle">-</span></div>
                    <div class="profile-row"><i>💽</i><span class="profile-label">Specialization:</span> <span class="profile-value" id="specialization">-</span></div>
                    <div class="profile-row"><i>🏃‍♀️</i><span class="profile-label">Multitasking:</span> <span class="profile-value" id="multitask">-</span></div>
                    <div class="profile-row"><i>⚠️</i><span class="profile-label">Overworking:</span> <span class="profile-value" id="overwork">-</span></div>
                    <div class="profile-row"><i>❌</i><span class="profile-label">Errors Tracked:</span> <span class="profile-value" id="errorsTracked">-</span></div>
                    <div class="profile-row"><i>🔄</i><span class="profile-label">Git Commits:</span> <span class="profile-value" id="gitCommits">-</span></div>
                    <div class="profile-row"><i>🗨️</i><span class="profile-label">Commenter Status:</span> <span class="profile-value" id="comments">-</span></div>
                </div>
                <p>

                </p>
                </div>
            </div>

            <div class="chart-section">
                <h2>Daily Coding Time</h2>
                <div id="dailyStacked"></div>
            </div>

            <div class="chart-grid">
                <div class="chart"><h2>Time per Project (min)</h2><div id="projectDoughnut"></div></div>
                <div class="chart"><h2>Time per Language (min)</h2><div id="langBar"></div></div>
                <div class="chart"><h2>Weekly Trend (min)</h2><div id="weeklyLine"></div></div>
                <div class="chart"><h2>Focus Score</h2><div id="focusGauge"></div></div>
                <div class="chart"><h2>Productive Hours</h2><div id="productiveHours"></div></div>
                <div class="chart"><h2>Total vs. Rest Time (min)</h2><div id="totalVsRest"></div></div>
                <div class="chart"><h2>Productivity per Language (Lines/min)</h2><div id="prodPerLang"></div></div>
                <div class="chart"><h2>Time Distribution (min)</h2><div id="timeDist"></div></div>
                <div class="chart"><h2>Coding Heatmap</h2><div id="activityHeat"></div></div>
                <div class="chart"><h2>Error Heatmap</h2><div id="errorHeat"></div></div>
                <div class="chart"><h2>Project Calendar</h2><div id="pieCalendar"></div></div>
            </div>
        </div>
    </div>
    <script>
        let charts = {};

        function msToHms(ms) {
            if (ms < 0) ms = 0;
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            return \`\${h}h \${m}m\`;
        }

        function createChart(id, option) {
            const chartDom = document.getElementById(id);
            if (chartDom) {
                if (charts[id]) {
                    charts[id].dispose();
                }
                const chart = echarts.init(chartDom, 'dark');
                chart.setOption(option);
                charts[id] = chart;
            }
        }
        
        function aggregate(entries, errors) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const weekAgo = today - 6 * 86400000;

            const byProject = {};
            const byLang = {};
            const byDay = {};
            const byHour = Array(24).fill(0);
            let writing = 0, thinking = 0, debugging = 0, rest = 0, errorTime = 0;
            let overworkDays = 0;
            let dailyWorkTimes = {};
            let switches = 0;
            let prodPerLang = {};
            let weekTrend = Array(7).fill(0);
            let focusScore = 0;
            let timeDist = { writing: 0, thinking: 0, debugging: 0, rest: 0, error: 0 };
            let activityHeat = Array(7).fill(0).map(() => Array(24).fill(0));
            let errorHeat = Array(7).fill(0).map(() => Array(24).fill(0));
            let langLines = {};
            let totalTimeMs = 0;
            let todayTimeMs = 0;
            let projectCalendarData = {};

            errors.forEach(e => {
                errorHeat[new Date(e.timestamp).getDay()][new Date(e.timestamp).getHours()] += 1;
            });

            entries.forEach(function(e) {
                const dur = e.end - e.start;
                if (dur <= 0) return;
                const durInMinutes = dur / 60000;
                totalTimeMs += dur;
                
                const day = new Date(e.start).setHours(0, 0, 0, 0);

                if (day === today) {
                    todayTimeMs += dur;
                }
                
                dailyWorkTimes[day] = (dailyWorkTimes[day] || 0) + dur;
                
                byProject[e.workspace] = (byProject[e.workspace] || 0) + durInMinutes;
                byLang[e.language] = (byLang[e.language] || 0) + durInMinutes;

                byDay[day] = (byDay[day] || { writing: 0, thinking: 0, debugging: 0, rest: 0, error: 0 });
                byDay[day][e.category] += durInMinutes;

                const hour = new Date(e.start).getHours();
                byHour[hour] += durInMinutes;

                if (e.start >= weekAgo) {
                    const dayIdx = Math.floor((e.start - weekAgo) / 86400000);
                    weekTrend[dayIdx] += durInMinutes;
                }

                if (day === today) {
                    if (e.category === 'writing') writing += durInMinutes;
                    if (e.category === 'thinking') thinking += durInMinutes;
                    if (e.category === 'debugging') debugging += durInMinutes;
                    if (e.category === 'rest') rest += durInMinutes;
                    if (e.category === 'error') errorTime += durInMinutes;
                }
                timeDist[e.category] += durInMinutes;

                const weekday = new Date(e.start).getDay();
                activityHeat[weekday][hour] += durInMinutes;
                

                if (e.category !== 'rest') {
                    const lastActiveEntry = entries.slice(0, entries.indexOf(e)).reverse().find(x => x.category !== 'rest');
                    if (lastActiveEntry && lastActiveEntry.workspace !== e.workspace) {
                        switches++;
                    }
                }
                
                prodPerLang[e.language] = (prodPerLang[e.language] || 0) + dur;
                if (e.category === 'writing') langLines[e.language] = (langLines[e.language] || 0) + Math.floor(dur / 10000);

                const dateStr = new Date(e.start).toISOString().split('T')[0];
                if (!projectCalendarData[dateStr]) {
                    projectCalendarData[dateStr] = {};
                }
                projectCalendarData[dateStr][e.workspace] = (projectCalendarData[dateStr][e.workspace] || 0) + durInMinutes;
            });
            
            for (const day in dailyWorkTimes) {
                if (dailyWorkTimes[day] > 10 * 3600000) {
                    overworkDays++;
                }
            }

            focusScore = (thinking ? writing / thinking : 1) * 100;
            
            const todayPrevDay = new Date(today - 86400000).getTime();
            const todayPrevDayTimeMs = entries.filter(e => e.start >= todayPrevDay && e.start < today && e.category !== 'rest')
                .reduce((sum, e) => sum + (e.end - e.start), 0);

            const nowWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
            const lastWeekStart = nowWeekStart - 7 * 86400000;
            const nowMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).getTime();

            const thisWeekTimeMs = entries.filter(e => e.start >= nowWeekStart).reduce((sum, e) => sum + (e.end - e.start), 0);
            const lastWeekTimeMs = entries.filter(e => e.start >= lastWeekStart && e.start < nowWeekStart).reduce((sum, e) => sum + (e.end - e.start), 0);
            const thisMonthTimeMs = entries.filter(e => e.start >= nowMonthStart).reduce((sum, e) => sum + (e.end - e.start), 0);
            const lastMonthTimeMs = entries.filter(e => e.start >= lastMonthStart && e.start < nowMonthStart).reduce((sum, e) => sum + (e.end - e.start), 0);
            
            const thisWeekDays = (now.getTime() - nowWeekStart) / 86400000;
            const lastWeekDays = 7;
            const thisMonthDays = (now.getTime() - nowMonthStart) / 86400000;
            const lastMonthDays = (lastMonthEnd - lastMonthStart) / 86400000;

            const thisWeekAvgMs = thisWeekTimeMs / thisWeekDays;
            const lastWeekAvgMs = lastWeekTimeMs / lastWeekDays;

            const totalErrors = errors.length;
            
            return {
                byProject, byLang, byDay, byHour, writing, thinking, debugging, rest, errorTime, overworkDays,
                switches, prodPerLang, weekTrend, focusScore, timeDist, activityHeat, errorHeat, langLines, totalErrors,
                projectCalendarData,
                summary: {
                    today: todayTimeMs,
                    todayPrev: todayPrevDayTimeMs,
                    thisWeekAvg: thisWeekAvgMs,
                    lastWeekAvg: lastWeekAvgMs,
                    thisMonth: thisMonthTimeMs,
                    lastMonth: lastMonthTimeMs,
                    total: totalTimeMs
                }
            };
        }

        function getDoughnutOption(data, title) {
            const total = data.reduce((sum, item) => sum + item.value, 0);
            return {
                title: {
                    text: title,
                    left: 'center',
                    top: '45%',
                    textStyle: {
                        color: '#ccc',
                        fontSize: 16
                    },
                    subtext: total > 0 ? msToHms(total * 60000) : 'No Data',
                    subtextStyle: {
                        color: 'var(--vscode-editor-foreground)',
                        fontSize: 18,
                        fontWeight: 'bold'
                    }
                },
                backgroundColor: { fill:'transparent' }, tooltip:  {
                    trigger: 'item',
                    formatter: '{a} <br/>{b}: {c}min ({d}%)'
                },
                legend: {
                    bottom: '0',
                    left: 'center',
                    textStyle: { color: '#ccc' }
                },
                series: [
                    {
                        name: 'Time',
                        type: 'pie',
                        radius: ['50%', '70%'],
                        center: ['50%', '50%'],
                        avoidLabelOverlap: false,
                        itemStyle: {
                            borderRadius: 10,
                            borderColor: '#1a1a1a',
                            borderWidth: 2
                        },
                        label: {
                            show: false,
                            position: 'center'
                        },
                        emphasis: {
                            label: {
                                show: true,
                                fontSize: 16,
                                fontWeight: 'bold'
                            }
                        },
                        labelLine: {
                            show: false
                        },
                        data: data
                    }
                ]
            };
        }

        function getBarOption(labels, data, title, tooltipFormatter = '{a} <br/>{b}: {c}min') {
            return {
                title: {
                    text: title,
                    show: false,
                },
                backgroundColor: { fill:'transparent' }, tooltip:  {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: tooltipFormatter,
                },
                xAxis: {
                    type: 'category',
                    data: labels,
                    axisLabel: { color: '#ccc' },
                    axisLine: { lineStyle: { color: '#444' } },
                    axisTick: { alignWithLabel: true }
                },
                yAxis: {
                    type: 'value',
                    name: 'Minutes',
                    nameTextStyle: { color: '#ccc' },
                    axisLabel: { color: '#ccc' },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
                },
                series: [{
                    name: 'Time',
                    type: 'bar',
                    data: data
                }]
            };
        }

        function getLineOption(labels, data, title) {
            return {
                title: {
                    text: title,
                    show: false,
                },
                backgroundColor: { fill:'transparent' }, tooltip:  {
                    trigger: 'axis'
                },
                xAxis: {
                    type: 'category',
                    boundaryGap: false,
                    data: labels,
                    axisLabel: { color: '#ccc' },
                    axisLine: { lineStyle: { color: '#444' } }
                },
                yAxis: {
                    type: 'value',
                    name: 'Minutes',
                    nameTextStyle: { color: '#ccc' },
                    axisLabel: { color: '#ccc' },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
                },
                series: [{
                    name: 'Time',
                    type: 'line',
                    data: data,
                    smooth: true
                }]
            };
        }
        
        function getGaugeOption(value, name, max=1) {
            return {
                backgroundColor: { fill:'transparent' }, tooltip:  {
                    formatter: '{a} <br/>{b} : {c}'
                },
                series: [
                    {
                        name: name,
                        type: 'gauge',
                        progress: { show: true },
                        detail: {
                            valueAnimation: true,
                            formatter: '{value}',
                            color: 'inherit'
                        },
                        data: [{ value: value, name: name }],
                        axisLabel: { color: '#ccc' },
                        pointer: { itemStyle: { color: 'inherit' } },
                        anchor: { show: true, showAbove: true, size: 20, itemStyle: { borderWidth: 10 } }
                    }
                ]
            };
        }
        
        function getStackedBarOption(labels, seriesData) {
            return {
                backgroundColor: { fill:'transparent' }, tooltip:  {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' }
                },
                legend: {
                    data: ['Writing', 'Thinking', 'Debugging'],
                    textStyle: { color: '#ccc' }
                },
                xAxis: {
                    type: 'category',
                    data: labels,
                    axisLabel: { color: '#ccc' },
                    axisLine: { lineStyle: { color: '#444' } }
                },
                yAxis: {
                    type: 'value',
                    name: 'Minutes',
                    nameTextStyle: { color: '#ccc' },
                    axisLabel: { color: '#ccc' },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
                },
                series: seriesData
            };
        }

        function getHeatmapOption(data) {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const hours = Array.from({length: 24}, (_, i) => i);
            const heatmapData = [];
            let maxValue = 0;

            for (let i = 0; i < 7; i++) {
                for (let j = 0; j < 24; j++) {
                    const value = data[i][j];
                    if (value > maxValue) maxValue = value;
                    heatmapData.push([j, i, value]);
                }
            }
            
            return {
                backgroundColor: { fill:'transparent' }, tooltip:  {
                    position: 'top',
                    formatter: (params) => {
                        return \`\${days[params.data[1]]}, \${params.data[0]}:00 - \${msToHms(params.data[2] * 60000)}\`;
                    }
                },
                grid: {
                    height: '50%',
                    top: '10%'
                },
                xAxis: {
                    type: 'category',
                    data: hours,
                    splitArea: { show: true },
                    axisLabel: { color: '#ccc' }
                },
                yAxis: {
                    type: 'category',
                    data: days,
                    splitArea: { show: true },
                    axisLabel: { color: '#ccc' }
                },
                visualMap: {
                    min: 0,
                    max: maxValue,
                    calculable: true,
                    orient: 'horizontal',
                    left: 'center',
                    bottom: '5%',
                    inRange: { color: ['#31363a', '#d94e5d'] },
                    textStyle: { color: 'var(--vscode-editor-foreground)' }
                },
                series: [{
                    name: 'Coding Activity',
                    type: 'heatmap',
                    data: heatmapData,
                    label: { show: false },
                    emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
                }]
            };
        }

        function getProjectCalendarOption(data) {
            const dailyData = Object.entries(data).map(([date, projects]) => {
                const totalMinutes = Object.values(projects).reduce((sum, min) => sum + min, 0);
                return [date, totalMinutes];
            });

            const projectNames = [...new Set(Object.values(data).flatMap(p => Object.keys(p)))];
            const pieData = Object.entries(data).map(([date, projects]) => ({
                date: date,
                projects: projects,
            }));

            return {
                backgroundColor: { fill:'transparent' }, tooltip:  {
                    formatter: (params) => {
                        if (params.data && params.data.projects) {
                             const total = Object.values(params.data.projects).reduce((sum, min) => sum + min, 0);
                             const date = params.data.date;
                             let tooltip = \`<b>\${date}</b><br/>Total: \${msToHms(total * 60000)}<br/>\`;
                             for (const [project, minutes] of Object.entries(params.data.projects)) {
                                 tooltip += \`\${project}: \${minutes.toFixed(0)} min<br/>\`;
                             }
                             return tooltip;
                        }
                        return '';
                    }
                },
                legend: {
                    data: projectNames,
                    top: 10,
                    textStyle: { color: '#ccc' }
                },
                calendar: {
                    top: 80,
                    left: 30,
                    right: 30,
                    cellSize: ['auto', 13],
                    range: '2025', // Should be dynamic
                    itemStyle: {
                        color: '#333',
                        borderWidth: 1,
                        borderColor: '#111'
                    },
                    yearLabel: { show: false },
                    dayLabel: {
                        nameMap: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                        color: '#ccc'
                    },
                    monthLabel: {
                        nameMap: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                        color: '#ccc'
                    }
                },
                series: [{
                    type: 'scatter',
                    coordinateSystem: 'calendar',
                    symbolSize: 0,
                    data: pieData,
                    backgroundColor: { fill:'transparent' }, tooltip:  {
                        position: 'right',
                        formatter: (params) => {
                             if (params.data.projects) {
                                  const total = Object.values(params.data.projects).reduce((sum, min) => sum + min, 0);
                                  const date = params.data.date;
                                  let tooltip = \`<b>\${date}</b><br/>Total: \${msToHms(total * 60000)}<br/>\`;
                                  for (const [project, minutes] of Object.entries(params.data.projects)) {
                                      tooltip += \`\${project}: \${minutes.toFixed(0)} min<br/>\`;
                                  }
                                  return tooltip;
                             }
                             return '';
                        }
                    }
                },
                ...projectNames.map(project => ({
                    name: project,
                    type: 'scatter',
                    coordinateSystem: 'calendar',
                    data: pieData.map(item => {
                        const totalMinutes = Object.values(item.projects).reduce((sum, min) => sum + min, 0);
                        return [item.date, item.projects[project] || 0, (item.projects[project] || 0) / totalMinutes];
                    }),
                    symbolSize: (value) => Math.sqrt(value[2]) * 20, // Adjust symbol size based on proportion
                    backgroundColor: { fill:'transparent' }, tooltip:  {
                        formatter: (params) => {
                             const date = params.data[0];
                             const minutes = params.data[1];
                             return \`\${date}<br/>\${project}: \${minutes.toFixed(0)} min\`;
                        }
                    }
                }))
                ]
            };
        }


        function render(entries, errors) {
            const agg = aggregate(entries, errors);
            
            document.getElementById('todayTime').textContent = msToHms(agg.summary.today);
            document.getElementById('totalTime').textContent = msToHms(agg.summary.total);
            document.getElementById('weeklyAvgTime').textContent = msToHms(agg.summary.thisWeekAvg);
            document.getElementById('monthlyTime').textContent = msToHms(agg.summary.thisMonth);
            
            const todayComparisonElement = document.getElementById('todayComparison');
            if (agg.summary.today > agg.summary.todayPrev) {
                todayComparisonElement.innerHTML = \`<span class="up">↑</span> \${msToHms(agg.summary.today - agg.summary.todayPrev)} more than yesterday\`;
            } else {
                todayComparisonElement.innerHTML = \`<span class="down">↓</span> \${msToHms(agg.summary.todayPrev - agg.summary.today)} less than yesterday\`;
            }

            let workRhythm = 'Normal';
            const morningHours = agg.byHour.slice(6, 12).reduce((a, b) => a + b, 0);
            const nightHours = agg.byHour.slice(18, 24).reduce((a, b) => a + b, 0);
            if (morningHours > nightHours * 1.5) workRhythm = 'Morning Person';
            else if (nightHours > morningHours * 1.5) workRhythm = 'Night Owl';
            document.getElementById('workRhythm').textContent = workRhythm;

            const avgDurations = entries.map(e => e.end - e.start).filter(d => d > 0);
            const avgSessionDuration = avgDurations.length > 0 ? avgDurations.reduce((a, b) => a + b, 0) / avgDurations.length : 0;
            document.getElementById('codingStyle').textContent = agg.thinking > agg.writing ? 'Thinker' : 'Doer';
            if (avgSessionDuration > 2 * 3600000) document.getElementById('codingStyle').textContent = 'Focused Coder';

            const commits = ${commits || 0};
            const comments = ${comments || 0};
            
            const totalLang = Object.values(agg.byLang).reduce((a, b) => a + b, 0);
            document.getElementById('specialization').textContent = Object.entries(agg.byLang).map(([l, v]) => \`\${l} (\${Math.round(100 * v / totalLang)}%)\`).join(', ');
            document.getElementById('multitask').textContent = \`\${agg.switches} switches\`;
            document.getElementById('overwork').textContent = agg.overworkDays > 0 ? \`Warning! (\${agg.overworkDays} days > 10h)\` : 'All good!';
            document.getElementById('errorsTracked').textContent = \`\${agg.totalErrors} errors\`;
            document.getElementById('gitCommits').textContent = \`\${commits} commits\`;
            document.getElementById('comments').textContent = \`\${comments} comments\`;

            let finalProfileDescription = \`You are a \${workRhythm} programmer who prefers \${document.getElementById('codingStyle').textContent} coding style.\`;
            if (agg.specialization) finalProfileDescription += \` Your specialization is \${agg.specialization}.\`;
            if (agg.multitask > 3) finalProfileDescription += \` You tend to multitask a lot with \${agg.multitask} switches.\`;
            else finalProfileDescription += \` You focus on one project at a time.\`;
            if (agg.overwork > 0) finalProfileDescription += \` You have \${agg.overwork} days of overworking (more than 10h).\`;
            else finalProfileDescription += \` You maintain a healthy work-life balance.\`;
            if (agg.totalErrors > 100) finalProfileDescription += \` You are a Pro! You have tracked \${agg.totalErrors} errors.\`;
            else finalProfileDescription += \` Your code is clean with only \${agg.totalErrors} errors tracked.\`;
            if (${comments} > 1e3) finalProfileDescription += \` You are a great communicator with \${comments} comments.\`;
            else if (${comments} > 100) finalProfileDescription += \` Come with those comments... just \${comments} comments is bleah...\`;
            else finalProfileDescription += \` You could improve your comments with only \${comments} comments.\`;
            if (${commits} > 1000) finalProfileDescription += \` You are a Git master with \${commits} commits.\`;
            else if (${commits} > 100) finalProfileDescription += \` A quite good Git user with \${commits} commits.\`;
            else finalProfileDescription += \` Do better Git usage... only \${commits} commits is shameful.\`;

            document.querySelector('.profile-info p').textContent = finalProfileDescription;
            // Render charts
            createChart('projectDoughnut', getDoughnutOption(Object.entries(agg.byProject).map(([name, value]) => ({name, value})), 'Time per Project'));
            createChart('langBar', getBarOption(Object.keys(agg.byLang), Object.values(agg.byLang), 'Time per Language (min)'));
            createChart('weeklyLine', getLineOption(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], agg.weekTrend, 'Weekly Trend (min)'));
            createChart('productiveHours', getBarOption(Array.from({ length: 24 }, (_, i) => i), agg.byHour, 'Productive Hours'));
            createChart('totalVsRest', getBarOption(['Total', 'Rest'], [agg.summary.total / 60000, agg.timeDist.rest], 'Total vs. Rest Time (min)'));
            createChart('timeDist', getDoughnutOption(Object.entries(agg.timeDist).map(([name, value]) => ({name, value})), 'Time Distribution'));
            createChart('prodPerLang', getBarOption(Object.keys(agg.langLines), Object.entries(agg.langLines).map(([lang, lines]) => lines / (agg.prodPerLang[lang] / 60000)), 'Productivity per Language (Lines/min)', '{a} <br/>{b}: {c} Lines/min'));

            const writingData = Object.keys(agg.byDay).map(ts => ({name: 'Writing', value: agg.byDay[ts]?.writing || 0}));
            const thinkingData = Object.keys(agg.byDay).map(ts => ({name: 'Thinking', value: agg.byDay[ts]?.thinking || 0}));
            const debuggingData = Object.keys(agg.byDay).map(ts => ({name: 'Debugging', value: agg.byDay[ts]?.debugging || 0}));
            
            createChart('dailyStacked', getStackedBarOption(
                Object.keys(agg.byDay).map(ts => new Date(parseInt(ts)).toLocaleDateString()),
                [
                    { name: 'Writing', type: 'bar', stack: 'total', data: Object.keys(agg.byDay).map(ts => agg.byDay[ts]?.writing || 0) },
                    { name: 'Thinking', type: 'bar', stack: 'total', data: Object.keys(agg.byDay).map(ts => agg.byDay[ts]?.thinking || 0) },
                    { name: 'Debugging', type: 'bar', stack: 'total', data: Object.keys(agg.byDay).map(ts => agg.byDay[ts]?.debugging || 0) }
                ]
            ));

            createChart('focusGauge', getGaugeOption(agg.focusScore.toFixed(2), 'Focus Score', 2));
            createChart('activityHeat', getHeatmapOption(agg.activityHeat));
            createChart('errorHeat', getHeatmapOption(agg.errorHeat));
            createChart('pieCalendar', getProjectCalendarOption(agg.projectCalendarData));
        }

        window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'update') {
                render(event.data.entries, event.data.errors);
            }
        });
        
        render(${initialData}, ${initialErrors});
        
        if (window.acquireVsCodeApi) {
            var vscode = acquireVsCodeApi();
            vscode.postMessage({ type: 'requestData' });
        }

        window.addEventListener('resize', () => {
            for (const id in charts) {
                charts[id].resize();
            }
        });

    </script>
</body>
</html>`;
}
