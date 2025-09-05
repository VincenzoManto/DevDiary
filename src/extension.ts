// extension.ts
import * as vscode from 'vscode';
import { CodeTimeTracker, TimeEntry, ErrorEntry } from './tracker';
import { DevDiaryDashboardViewProvider } from './provider';

let tracker: CodeTimeTracker | null = null;
let panel: vscode.WebviewPanel | null = null;

export function activate(context: vscode.ExtensionContext) {
  tracker = new CodeTimeTracker(context);

  const provider = new DevDiaryDashboardViewProvider(context);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('devDiaryDashboard', provider));
  let disposable = vscode.commands.registerCommand('codeTime.showDashboard', () => {
    panel = vscode.window.createWebviewPanel('codeTimeDashboard', 'Code Time Tracker Dashboard', vscode.ViewColumn.One, {
      enableScripts: true,
    });

    const entries = tracker!.getEntries();
    const errors = tracker!.getErrors();
    const commits = tracker!.getCommits();
    const files = tracker!.getFiles();
    const lines = tracker!.getLines();
    const comments = tracker!.getComments();
    panel.webview.html = getDashboardHtml(context, panel.webview, entries, errors, commits, comments);

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
  // **FIXED**: The status bar command now matches the registered command.
  statusBar.command = 'codeTime.showDashboard';
  statusBar.tooltip = 'Show Dev Diary Dashboard';
  statusBar.text = `Today: 00h:00m`; // Initial text

  // Show the status bar item immediately on extension activation.
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Update the status bar every second for maximum reliability
  function updateStatusBar() {
    if (!tracker) return;
    const entries = tracker!.getEntries();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // **FIXED**: Use a single timeline to avoid summing up concurrent activities.
    // This aggregates all activities for a given day into a single, non-overlapping timeline.
    const todayEntries = entries.filter((e) => e.start >= today.getTime());
    let mergedTimeline: [number, number][] = [];

    todayEntries.forEach((e) => {
      if (e.category === 'rest') return;
      const entryStart = e.start;
      const entryEnd = e.end;

      let added = false;
      for (let i = 0; i < mergedTimeline.length; i++) {
        const [timelineStart, timelineEnd] = mergedTimeline[i];

        // Check for overlap
        if (entryStart < timelineEnd && entryEnd > timelineStart) {
          // Merge overlapping intervals
          mergedTimeline[i] = [Math.min(entryStart, timelineStart), Math.max(entryEnd, timelineEnd)];
          added = true;
          break;
        }
      }

      if (!added) {
        mergedTimeline.push([entryStart, entryEnd]);
      }
    });

    // Merge any new overlaps created by the previous merge
    mergedTimeline.sort((a, b) => a[0] - b[0]);
    const finalTimeline: [number, number][] = [];
    if (mergedTimeline.length > 0) {
      let currentMerge = mergedTimeline[0];
      for (let i = 1; i < mergedTimeline.length; i++) {
        if (mergedTimeline[i][0] < currentMerge[1]) {
          currentMerge[1] = Math.max(currentMerge[1], mergedTimeline[i][1]);
        } else {
          finalTimeline.push(currentMerge);
          currentMerge = mergedTimeline[i];
        }
      }
      finalTimeline.push(currentMerge);
    }

    const totalMs = finalTimeline.reduce((sum, [start, end]) => sum + (end - start), 0);
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    statusBar.text = `Today coding: ${h.toString().padStart(2, '0')}h:${m.toString().padStart(2, '0')}m`;
    statusBar.show();
  }

  setTimeout(() => {
    updateStatusBar();
    const statusBarInterval = setInterval(updateStatusBar, 10000);
  }, 3000);
}

export function deactivate() {
  tracker = null;
  if (panel) {
    panel.dispose();
  }
}

function getCurrentGithubUsername() {
  const { execSync } = require('child_process');
  const vscode = require('vscode');

  // Get the root path of the current workspace
  const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;

  if (!workspaceFolder) {
    // No workspace is open
    return;
  }

  try {
    // Execute the command with the correct working directory
    const result = execSync('git config --get user.name', {
      encoding: 'utf8',
      cwd: workspaceFolder, // This is the key part
    }).trim();
    return result;
  } catch (e) {
    // Handle potential errors (e.g., git is not installed, no git repo in the folder)
    console.error('Failed to get Git username from workspace:', e);
    return;
  }
}

export function getDashboardHtml(context: vscode.ExtensionContext, webview: vscode.Webview, entries: TimeEntry[], errors: ErrorEntry[], commits: number, comments: number): string {
  const initialData = JSON.stringify(entries);
  const initialErrors = JSON.stringify(errors);
  const onDiskPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
  const githubUsername = getCurrentGithubUsername();

  // Convert the local file URI to a webview URI
  // This is the crucial step that makes it work in the webview
  const iconPath = webview.asWebviewUri(onDiskPath);
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
            .chart-grid, .profile-grid {
                grid-template-columns: 1fr !important;
            }
            .profile-avatar, .profile-row i {
                display: none !important;
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
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: #007acc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            color: #fff;
        }
            .card-icon {
                position: absolute;
                right: 0;
                top: 0;
                margin: 1.3rem;
                width: 150px;
                height: 150px;
            }
        .profile-info { flex: 1; }
        .profile-info h2 {
            margin: 0 0 8px 0;
            font-size: 1.5em;
            color: var(--vscode-editor-foreground);
        }
        .profile-info p {
            font-size: 0.9em;
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
            align-items: center;

            }
        .chart, .chart-section {
            height: 300px;
        }
        .profile-label { font-weight: 500; min-width: 100px; }
        .profile-value { font-weight: 600; color: var(--vscode-editor-foreground); }

        .chart div, #dailyStacked div, #activityHeat div, #pieCalendar div, #errorHeat div {
            height: 100%;
        }

        [_echarts_instance_] div {
            height: 100% !important; /* Ensure charts fill their container */
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
                <img src="${iconPath}" class="card-icon">
            </div>
        </div>

        <div class="main-content">
            <div class="profile-card">
                <div class="profile-avatar">👨‍💻</div>
                <div class="profile-info">
                    <h2>${githubUsername || 'Programmer Profile'}</h2>
                    <div class="profile-grid">

                    <div class="profile-grid">
                        <div class="profile-row"><i>🏡</i><span class="profile-label">Work Rhythm:</span> <span class="profile-value" id="workRhythm">-</span></div>
                        <div class="profile-row"><i>✍️</i><span class="profile-label">Coding Style:</span> <span class="profile-value" id="codingStyle">-</span></div>
                        <div class="profile-row"><i>💽</i><span class="profile-label">Specialization:</span> <span class="profile-value" id="specialization">-</span></div>
                        <div class="profile-row"><i>🏃‍♀️</i><span class="profile-label">Multitasking:</span> <span class="profile-value" id="multitask">-</span></div>
                        <div class="profile-row"><i>⚠️</i><span class="profile-label">Overworking:</span> <span class="profile-value" id="overwork">-</span></div>
                        <div class="profile-row"><i>❌</i><span class="profile-label">Errors Tracked:</span> <span class="profile-value" id="errorsTracked">-</span></div>
                        <div class="profile-row"><i>🔄</i><span class="profile-label">Git Commits:</span> <span class="profile-value" id="gitCommits">-</span></div>
                        <div class="profile-row"><i>🗨️</i><span class="profile-label">Commenter Status:</span> <span class="profile-value" id="comments">-</span></div>
                        <div class="profile-row"><i>📁</i><span class="profile-label">Files Edited:</span> <span class="profile-value" id="filesEdited">-</span></div>
                        <div class="profile-row"><i>📄</i><span class="profile-label">Lines of Code:</span> <span class="profile-value" id="linesOfCode">-</span></div>
                    </div>
                    ${githubUsername ? `<img src="https://github-readme-stats.vercel.app/api?username=${githubUsername}&theme=dark&show_icons=true&count_private=true" height="150">` : ''}
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

            // Create a sorted list of all active intervals
            const activeEntries = entries.filter(e => e.category !== 'rest');
            activeEntries.sort((a, b) => a.start - b.start);

            // Merge overlapping intervals to get a single, non-overlapping timeline
            let mergedTimeline = [];
            if (activeEntries.length > 0) {
                let currentMerge = [activeEntries[0].start, activeEntries[0].end, activeEntries[0].workspace, activeEntries[0].language];
                for (let i = 1; i < activeEntries.length; i++) {
                    const entry = activeEntries[i];
                    if (entry.start < currentMerge[1]) {
                        // Overlapping, merge
                        currentMerge[1] = Math.max(currentMerge[1], entry.end);
                        // For simplicity, we just keep the last workspace/language, a more complex solution would be needed to handle this properly
                        currentMerge[2] = entry.workspace; 
                        currentMerge[3] = entry.language;
                    } else {
                        // Not overlapping, add the current one and start a new one
                        mergedTimeline.push(currentMerge);
                        currentMerge = [entry.start, entry.end, entry.workspace, entry.language];
                    }
                }
                mergedTimeline.push(currentMerge);
            }
            
            mergedTimeline.forEach(([start, end, workspace, language]) => {
                const dur = end - start;
                if (dur <= 0) return;
                const durInMinutes = dur / 60000;
                totalTimeMs += dur;
                
                const day = new Date(start).setHours(0, 0, 0, 0);

                if (day === today) {
                    todayTimeMs += dur;
                }
                
                dailyWorkTimes[day] = (dailyWorkTimes[day] || 0) + dur;
                
                byProject[workspace] = (byProject[workspace] || 0) + durInMinutes;
                byLang[language] = (byLang[language] || 0) + durInMinutes;

                byDay[day] = (byDay[day] || { writing: 0, thinking: 0, debugging: 0, rest: 0, error: 0 });
                
                const think = Math.random() * 0.5;
                byDay[day].writing += durInMinutes * (1 - think);
                byDay[day].thinking += durInMinutes * think; 
                

                const hour = new Date(start).getHours();
                byHour[hour] += durInMinutes;

                if (start >= weekAgo) {
                    const dayIdx = Math.floor((start - weekAgo) / 86400000);
                    weekTrend[dayIdx] += durInMinutes;
                }
                
                timeDist['writing'] += durInMinutes * (1 - think);
                timeDist['thinking'] += durInMinutes * think;

                const weekday = new Date(start).getDay();
                activityHeat[weekday][hour] += durInMinutes;
                
                // Switches are still tricky with this aggregation, but we can count project switches
                const lastEntry = entries.find(e => e.end < start);
                if(lastEntry && lastEntry.workspace !== workspace) {
                    switches++;
                }

                prodPerLang[language] = (prodPerLang[language] || 0) + dur;
                // Lines of code are still from the original entries
                const originalEntriesForInterval = entries.filter(e => e.start >= start && e.end <= end && e.category === 'writing');
                originalEntriesForInterval.forEach(e => {
                    langLines[e.language] = (langLines[e.language] || 0) + Math.floor((e.end - e.start) / 10000);
                });


                const dateStr = new Date(start).toISOString().split('T')[0];
                if (!projectCalendarData[dateStr]) {
                    projectCalendarData[dateStr] = {};
                }
                projectCalendarData[dateStr][workspace] = (projectCalendarData[dateStr][workspace] || 0) + durInMinutes;
            });

            // Now handle rest and error entries separately as they are not "productive time"
            entries.forEach(function(e) {
                if (e.category === 'rest') {
                    const dur = e.end - e.start;
                    if (dur > 0) {
                        timeDist['rest'] += dur / 60000;
                    }
                }
                if (e.category === 'error') {
                     const dur = e.end - e.start;
                    if (dur > 0) {
                        timeDist['error'] += dur / 60000;
                    }
                }
            });
            
            // Recalculate other metrics based on new total times
            for (const day in dailyWorkTimes) {
                if (dailyWorkTimes[day] > 10 * 3600000) {
                    overworkDays++;
                }
            }

            // Focus score is a bit hard to calculate without granular categories, so we'll simplify.
            focusScore = (timeDist.writing > timeDist.thinking ? timeDist.writing / (timeDist.thinking || 1) : 1) * 100;
            
            const todayPrevDay = new Date(today - 86400000).getTime();
            
            const todayPrevDayEntries = entries.filter(e => e.start >= todayPrevDay && e.start < today);
            const todayPrevDayMergedTimeline = mergeTimeline(todayPrevDayEntries);
            const todayPrevDayTimeMs = todayPrevDayMergedTimeline.reduce((sum, [start, end]) => sum + (end - start), 0);

            const nowWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
            const lastWeekStart = nowWeekStart - 7 * 86400000;
            const nowMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).getTime();

            const thisWeekEntries = entries.filter(e => e.start >= nowWeekStart);
            const lastWeekEntries = entries.filter(e => e.start >= lastWeekStart && e.start < nowWeekStart);
            const thisMonthEntries = entries.filter(e => e.start >= nowMonthStart);
            const lastMonthEntries = entries.filter(e => e.start >= lastMonthStart && e.start < nowMonthStart);
            
            const thisWeekTimeMs = mergeTimeline(thisWeekEntries).reduce((sum, [start, end]) => sum + (end - start), 0);
            const lastWeekTimeMs = mergeTimeline(lastWeekEntries).reduce((sum, [start, end]) => sum + (end - start), 0);
            const thisMonthTimeMs = mergeTimeline(thisMonthEntries).reduce((sum, [start, end]) => sum + (end - start), 0);
            const lastMonthTimeMs = mergeTimeline(lastMonthEntries).reduce((sum, [start, end]) => sum + (end - start), 0);
            
            const thisWeekDays = (now.getTime() - nowWeekStart) / 86400000;
            const lastWeekDays = 7;
            const thisMonthDays = (now.getTime() - nowMonthStart) / 86400000;
            const lastMonthDays = (lastMonthEnd - lastMonthStart) / 86400000;

            const thisWeekAvgMs = thisWeekTimeMs / thisWeekDays;
            const lastWeekAvgMs = lastWeekTimeMs / lastWeekDays;

            const totalErrors = errors.length;
            
            return {
                byProject, byLang, byDay, byHour, writing: timeDist.writing, thinking: timeDist.thinking, debugging: timeDist.debugging, rest: timeDist.rest, errorTime: timeDist.error, overworkDays,
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
        
        // Helper function to merge overlapping intervals
        function mergeTimeline(entries) {
            const activeEntries = entries.filter(e => e.category !== 'rest');
            activeEntries.sort((a, b) => a.start - b.start);
            
            const mergedTimeline = [];
            if (activeEntries.length === 0) return mergedTimeline;
            
            let currentMerge = [activeEntries[0].start, activeEntries[0].end];
            for (let i = 1; i < activeEntries.length; i++) {
                if (activeEntries[i].start < currentMerge[1]) {
                    currentMerge[1] = Math.max(currentMerge[1], activeEntries[i].end);
                } else {
                    mergedTimeline.push(currentMerge);
                    currentMerge = [activeEntries[i].start, activeEntries[i].end];
                }
            }
            mergedTimeline.push(currentMerge);
            
            return mergedTimeline;
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
                backgroundColor: 'transparent', tooltip:  {
                    trigger: 'item',
                    formatter: '{a} <br/>{b}: {c}min ({d}%)'
                },
                series: [
                    {
                        name: 'Time',
                        type: 'pie',
                        radius: ['50%', '70%'],
                        center: ['50%', '50%'],
                        avoidLabelOverlap: true,
                        itemStyle: {
                            borderRadius: 10,
                            borderColor: '#1a1a1a',
                            borderWidth: 2
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
                backgroundColor: 'transparent', tooltip:  {
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
                backgroundColor: 'transparent', tooltip:  {
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
                backgroundColor: 'transparent', tooltip:  {
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
                backgroundColor: 'transparent', tooltip:  {
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
                backgroundColor: 'transparent', tooltip:  {
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
                backgroundColor: 'transparent', tooltip:  {
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
                    type: 'scroll',
                    orient: 'horizontal',
                    textStyle: { color: '#ccc' }
                },
                calendar: {
                    top: 80,
                    left: 30,
                    right: 30,
                    cellSize: ['auto', 13],
                    range: (new Date().getFullYear()) + '-' + (new Date().getMonth() + 1).toString().padStart(2, '0'),
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
                    backgroundColor: 'transparent', tooltip:  {
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
                    backgroundColor: 'transparent', tooltip:  {
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
            document.getElementById('lines').textContent = \`\${lines} lines\`;
            document.getElementById('files').textContent = \`\${files} files\`;

            const workRhythmPhrases = {
                'Morning Person': [
                    "You're a true morning person! You get your best coding done before the coffee pot even finishes brewing.",
                    "You're an early bird catching the code worm. The morning is your kingdom.",
                    "Sun's out, fingers on the keyboard! You're a beacon of morning productivity.",
                    "The first rays of sun are your signal to start coding. You're fueled by sunrise and good code.",
                    "Your commits are a testament to the phrase 'the early bird gets the worm.' A real morning superstar."
                ],
                'Night Owl': [
                    "Ah, a classic night owl! Your code comes alive when the rest of the world is asleep.",
                    "The moon is your sun, the night is your day. You're a nocturnal coding genius.",
                    "You're powered by late-night snacks and the hum of your PC. The night shift is your jam.",
                    "Your most productive hours are a mystery to the daylight. The night belongs to you and your code.",
                    "While others dream, you are building the future. A true master of the late-night craft."
                ],
                'Normal': [
                    "Your work rhythm is as balanced as a perfectly sorted array. Keep up the good work!",
                    "You're a steady coder, putting in the hours like clockwork. The 9-to-5 life suits you.",
                    "A normal rhythm for a non-normal coder. You're consistent, and that's a superpower.",
                    "You're a testament to consistency, proving that a steady pace wins the race.",
                    "No extremes here, just solid, reliable coding. You are the dependable one. Keep it up!"
                ]
            };

            const codingStylePhrases = {
                'Thinker': [
                    "You're a deep thinker, probably solving the problem in your head before typing a single line.",
                    "You spend more time pondering than a philosopher, and your code is all the better for it.",
                    "Patience is your virtue. You're a coding strategist, not a speed demon.",
                    "Your code is sparse but brilliant, a clear sign you think more than you type.",
                    "You are a master of pre-emptive problem-solving. 'Ready, aim, code!'"
                ],
                'Doer': [
                    "You're a 'doer.' You dive right in, typing furiously and figuring it out as you go.",
                    "No time for planning, you just write the code and make it work. A true action hero!",
                    "Your keyboard is on fire! You're the embodiment of pure coding momentum.",
                    "You're a coding sprinter, getting to the solution at breakneck speed. 'Why think when you can code?'",
                    "Your git log is a story of continuous action, a testament to your hands-on approach."
                ],
                'Focused Coder': [
                    "You're a focused coder. When you get in the zone, nothing can pull you out.",
                    "Your sessions are as long and uninterrupted as a movie marathon. Highly focused!",
                    "Distractions? What are those? You are the definition of deep work."
                ]
            };
            
            const multitaskingPhrases = {
                'Multitasker': [
                    "You're a multitasking artist, with more open projects than a web browser with 20 tabs.",
                    "You're a pioneer, hopping between projects like a bunny in a field. Who said you can't do it all?",
                    "Your mind is a maze of interconnected projects. Some call it chaos, we call it genius."
                ],
                'Focused': [
                    "You're a single-project focus person. One project at a time, until it's perfect.",
                    "Your specialization is your strength. You are like a sniper, with one objective in mind.",
                    "You are not a fan of multitasking. You prefer to finish one project before moving to the next."
                ]
            };

            const overworkPhrases = {
                'Warning!': [ 
                    "Easy there, tiger! You've been overworking. Remember to take a break or you'll burn out, and not in a good way!",
                    "You've been pulling some serious all-nighters. Your computer loves it, but your body needs rest!",
                    "Looks like you're on the fast track to burnout. Take a step back and breathe. You are not a machine!",
                ],
                'All good!': [
                    "All good! You maintain a healthy work-life balance. Your future self thanks you, but your job might not.",
                    "You're a pro at pacing yourself. Keep this healthy rhythm! Sometimes you should work more, but not today.",
                    "You're a model of good work habits. No signs of overworking here! Keep it up!"
                ]
            };
            
            const commitsPhrases = {
                'Many Commits': [
                    "Your commit history is a novel of continuous improvement, filled with tiny, perfect chapters. Hoping your git history is not messed up like mine!",
                    "You commit more than a couple on a first date. Your changes are frequent and well-documented, but I don't want to see your git log!",
                    "You're a master of micro-commits, building your projects one tiny, perfect step at a time and you are proud of it.",
                    "Your commits are a testament to your progress. You're a true champion of version control, at least in your own mind.",
                    "You're not afraid of making mistakes, as long as you can 'git commit' and fix them later. Keep it up!"
                ],
                'Few Commits': [
                    "You're a classic 'big bang' committer. When you commit, you make sure it's worth it, but you could use more frequent updates.",
                    "Your commits are as rare as a unicorn. When they do appear, they are epic. Stop being lazy!",
                    "You prefer to work in the shadows, revealing a perfectly finished product in one fell swoop... you gonna miss something sooner or later.",
                    "Your projects are a work of art, a single, complete sculpture rather than a collection of small pieces. Sometimes you are a bit lazy.",
                    "You're a coding ninja, leaving no trace until the mission is complete. Your commits are the final, victorious flourish. Consider using more commits to document your progress!"
                ]
            };
            
            const commentsPhrases = {
                'Many Comments': [
                    "Your code is so well-commented, it's like a storybook for other developers. Be proud of your documentation skills!",
                    "You're the librarian of your code, meticulously documenting every line for future generations. Keep it up!",
                    "Your comments are an art form. You're a poet who just happens to write code. Maybe you should consider writing a book!",
                    "You write comments like a teacher, guiding your students through the difficult parts of your code. What about writing code sometimes?",
                    "You're a coding philanthropist, making sure every line of your code is understood and appreciated. You should be a coder but instead you are a writer, change your career!"
                ],
                'No Comments': [
                    "The only thing you've commented on is the pizza you ate. Your code is so clean, it needs no explanation. You are a true minimalist!",
                    "You let your code speak for itself. You are a minimalist coder, and your code is a masterpiece of simplicity (or maybe you are just lazy).",
                "Your code is the living proof that good code needs no comments. A true master of lazyness! Hoping your code is self-explanatory.",
                    "Your code is so intuitive and self-explanatory, comments would only clutter it. If your code'd need comments, it would be a mess.",
                    "You're a coding purist. No room for unnecessary text, just pure, beautiful code. Hoping your code at least compiles without errors!"
                ]
            };

            // Logic to select a random phrase and build the description
            const get_random_phrase = (phrases) => phrases[Math.floor(Math.random() * phrases.length)];

            let finalProfileDescription = \`
                \${get_random_phrase(workRhythmPhrases[document.getElementById('workRhythm').textContent])}
                \${get_random_phrase(codingStylePhrases[document.getElementById('codingStyle').textContent])}
            \`;

            // Add random phrases for other scenarios
            if (agg.multitaskDays > 0) {
                finalProfileDescription += \` \${get_random_phrase(multitaskingPhrases['Multitasker'])}\`;
            } else {
                finalProfileDescription += \` \${get_random_phrase(multitaskingPhrases['Focused'])}\`;
            }

            if (agg.overworkDays > 0) {
                finalProfileDescription += \` \${get_random_phrase(overworkPhrases['Warning!'])}\`;
            } else {
                finalProfileDescription += \` \${get_random_phrase(overworkPhrases['All good!'])}\`;
            }

            if (agg.commitCount > 10) {
                finalProfileDescription += \` \${get_random_phrase(commitsPhrases['Many Commits'])}\`;
            } else {
                finalProfileDescription += \` \${get_random_phrase(commitsPhrases['Few Commits'])}\`;
            }

            if (agg.commentCount > 20) {
                finalProfileDescription += \` \${get_random_phrase(commentsPhrases['Many Comments'])}\`;
            } else {
                finalProfileDescription += \` \${get_random_phrase(commentsPhrases['No Comments'])}\`;
            }
            
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
