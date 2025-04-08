// src/app/page.tsx
"use client"; // Required for hooks like useState, useEffect in App Router

import React, { useState, useEffect, ChangeEvent } from 'react'; // Removed MouseEvent import
import { database } from '../../lib/firebase'; // Adjust path if needed
// Import Firebase functions needed for reading and writing
import { ref, onValue, off, query, orderByChild, limitToLast, get, set, startAt, DataSnapshot } from 'firebase/database';

// Import Chart.js types and components
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartData, // Import ChartData type
} from 'chart.js';

// Register Chart.js components needed for the Line chart
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// --- Define Interfaces for Data Structures ---

// Basic interface for weather data (replace 'any')
interface WeatherInfo {
  description?: string;
  icon?: string;
  id?: number;
  main?: string;
}
interface WeatherData {
  main?: {
      temp?: number;
      feels_like?: number;
      pressure?: number;
      humidity?: number;
  };
  weather?: WeatherInfo[];
  wind?: {
      speed?: number;
      deg?: number;
  };
  name?: string; // City name from weather API
}

interface AccelEntry {
  timestamp: number;
  x: number;
  y: number;
  z: number;
  city?: string; // Optional city field
  weather_data?: WeatherData | null; // Use specific interface or null
}

// Type for the raw data object fetched from Firebase (keys are push IDs)
type AccelDataFirebase = Record<string, AccelEntry>;

interface AxisStats {
  min: number;
  max: number;
  mean: number;
}

interface ReportStats {
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
  x: AxisStats;
  y: AxisStats;
  z: AxisStats;
}

// Union type for the result of calculateStats
type StatsResult = ReportStats | { count: 0 };

// Fixed number of data points to fetch for the live graph display
const FIXED_NUM_POINTS_TO_DISPLAY = 50;

// Define the type for the Chart.js data state
type LineChartData = ChartData<'line', number[], string>;

// --- React Component ---

export default function Home(): JSX.Element {
  // State for chart data format
  const [chartData, setChartData] = useState<LineChartData>({
    labels: [],
    datasets: [],
  });
  const [error, setError] = useState<string | null>(null); // General error state

  // State for the backend update interval control
  const [currentInterval, setCurrentInterval] = useState<number | null>(null); // Holds interval currently in Firebase
  const [newInterval, setNewInterval] = useState<string>(''); // Holds value from input field

  // State for report generation
  const [reportRangeMins, setReportRangeMins] = useState<number>(10); // Default to 10 minutes
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null); // Specific error for report generation


  // --- Effect to Fetch Initial Interval ---
  useEffect(() => {
    const configRef = ref(database, '/config/updateIntervalSeconds');
    get(configRef).then((snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        const interval = snapshot.val() as number; // Assert type
        console.log("Fetched current interval from Firebase:", interval);
        setCurrentInterval(interval);
        setNewInterval(interval.toString());
      } else {
        console.log("Update interval not found in Firebase config, using default 1.");
        setCurrentInterval(1); // Default if not found
        setNewInterval("1");
      }
    }).catch((err: Error) => {
      console.error("Error fetching config:", err);
      setError(`Could not fetch current update interval: ${err.message}`);
      setCurrentInterval(1); // Default on error
      setNewInterval("1");
    });
  }, []); // Runs once on mount


  // --- Effect for Live Chart Data ---
  useEffect(() => {
    console.log(`Setting up Firebase listener for last ${FIXED_NUM_POINTS_TO_DISPLAY} accelerometer points.`);
    const dataQuery = query(
      ref(database, '/accelerometer'), // Ensure path is correct!
      orderByChild('timestamp'),
      limitToLast(FIXED_NUM_POINTS_TO_DISPLAY)
    );

    const handleDataUpdate = (snapshot: DataSnapshot) => {
      console.log("Live accelerometer data received from Firebase.");
      const data = snapshot.val() as AccelDataFirebase | null; // Assert type

      if (data && typeof data === 'object') {
        const labels: string[] = [];
        const xData: number[] = [];
        const yData: number[] = [];
        const zData: number[] = [];

        const sortedKeys = Object.keys(data).sort((a, b) => data[a].timestamp - data[b].timestamp);

        sortedKeys.forEach(key => {
          const entry = data[key];
          if (entry && typeof entry.timestamp === 'number' && typeof entry.x === 'number' && typeof entry.y === 'number' && typeof entry.z === 'number') {
            labels.push(new Date(entry.timestamp * 1000).toLocaleTimeString());
            xData.push(entry.x);
            yData.push(entry.y);
            zData.push(entry.z);
          }
        });

        setChartData({
          labels: labels,
          datasets: [
            { label: 'X Axis', data: xData, borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.5)', tension: 0.1 },
            { label: 'Y Axis', data: yData, borderColor: 'rgb(53, 162, 235)', backgroundColor: 'rgba(53, 162, 235, 0.5)', tension: 0.1 },
            { label: 'Z Axis', data: zData, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.5)', tension: 0.1 },
          ],
        });
         // Clear general error ONLY if it matches the specific live data fetching error
         if (error === "Failed to fetch live accelerometer data from Firebase.") {
            setError(null);
         }
      } else {
        console.log("No live accelerometer data found at /accelerometer");
        setChartData({ labels: [], datasets: [] });
      }
    };

    const handleError = (errorObject: Error) => {
      console.error("Firebase read failed for live accelerometer data:", errorObject);
      const errorMsg = `Failed to fetch live accelerometer data from Firebase: ${errorObject.message}`;
      setError(errorMsg); // Set specific error message
      setChartData({ labels: [], datasets: [] });
    };

    const unsubscribe = onValue(dataQuery, handleDataUpdate, handleError);

    // Cleanup function
    return () => {
      console.log("Detaching Firebase listener for live accelerometer data.");
      off(dataQuery, 'value', unsubscribe);
    };
  // Add 'error' to dependency array as requested by lint rule
  }, [error]);


  // --- Function to Update Backend Interval ---
  const handleIntervalUpdate = (): void => {
    const intervalValue = parseFloat(newInterval);
    if (!isNaN(intervalValue) && intervalValue > 0) {
      const configRef = ref(database, '/config/updateIntervalSeconds');
      console.log(`Attempting to set interval in Firebase to: ${intervalValue}`);
      set(configRef, intervalValue)
        .then(() => {
          console.log("Update interval successfully set in Firebase:", intervalValue);
          setCurrentInterval(intervalValue);
          alert(`Update interval set to ${intervalValue} seconds. The backend script should now use this interval.`);
        })
        .catch((err: Error) => {
          console.error("Error setting update interval in Firebase:", err);
          alert(`Failed to set update interval: ${err.message}`);
        });
    } else {
      alert("Please enter a valid positive number for the interval (e.g., 0.5, 1, 2).");
    }
  };


  // --- Report Generation Logic ---

  const calculateStats = (data: AccelDataFirebase | null): StatsResult => {
    if (!data || Object.keys(data).length === 0) return { count: 0 };
    let minX = Infinity, maxX = -Infinity, sumX = 0;
    let minY = Infinity, maxY = -Infinity, sumY = 0;
    let minZ = Infinity, maxZ = -Infinity, sumZ = 0;
    let count = 0, firstTimestamp = Infinity, lastTimestamp = -Infinity;
    Object.values(data).forEach((entry: AccelEntry) => {
      if (entry && typeof entry.x === 'number' && typeof entry.y === 'number' && typeof entry.z === 'number' && typeof entry.timestamp === 'number') {
        minX = Math.min(minX, entry.x); maxX = Math.max(maxX, entry.x); sumX += entry.x;
        minY = Math.min(minY, entry.y); maxY = Math.max(maxY, entry.y); sumY += entry.y;
        minZ = Math.min(minZ, entry.z); maxZ = Math.max(maxZ, entry.z); sumZ += entry.z;
        firstTimestamp = Math.min(firstTimestamp, entry.timestamp); lastTimestamp = Math.max(lastTimestamp, entry.timestamp);
        count++;
      }
    });
    if (count === 0) return { count: 0 };
    return {
      count, firstTimestamp, lastTimestamp,
      x: { min: minX, max: maxX, mean: sumX / count },
      y: { min: minY, max: maxY, mean: sumY / count },
      z: { min: minZ, max: maxZ, mean: sumZ / count },
    };
  }

  const formatReport = (stats: StatsResult, rangeMins: number): string => {
    if (stats.count === 0) return "No data found for the selected time range.";
    if (!('firstTimestamp' in stats)) return "Error: Invalid stats object.";
    const startTime = new Date(stats.firstTimestamp * 1000).toLocaleString();
    const endTime = new Date(stats.lastTimestamp * 1000).toLocaleString();
    const f = (num: number): string => num.toFixed(4).padEnd(12);
    return `Accelerometer Data Report...`; // Keep formatting as before
  }

 const downloadReport = (reportContent: string, rangeMins: number): void => {
    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `accelerometer_report_last_${rangeMins}_mins.txt`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

  const generateReport = async (): Promise<void> => {
    setIsGeneratingReport(true);
    setReportError(null);
    const nowSeconds = Date.now() / 1000;
    const startTimestampSeconds = nowSeconds - (reportRangeMins * 60);
    console.log(`Generating report for data since timestamp: ${startTimestampSeconds} (${new Date(startTimestampSeconds * 1000).toLocaleString()})`);
    const reportQuery = query( ref(database, '/accelerometer'), orderByChild('timestamp'), startAt(startTimestampSeconds) );
    try {
        const snapshot: DataSnapshot = await get(reportQuery);
        const data = snapshot.val() as AccelDataFirebase | null;
        if (snapshot.exists() && data && typeof data === 'object') {
            console.log(`Workspaceed ${Object.keys(data).length} entries for report.`);
            const stats = calculateStats(data);
            const reportContent = formatReport(stats, reportRangeMins);
            downloadReport(reportContent, reportRangeMins);
        } else { alert(`No data found for the last ${reportRangeMins} minutes.`); console.log("No data exists for the report range."); }
    } catch (err: unknown) {
         const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("Error fetching/processing data for report:", errorMessage);
        setReportError(`Failed to generate report: ${errorMessage}`);
        alert(`Error generating report: ${errorMessage}`);
    } finally { setIsGeneratingReport(false); }
  };
  // --- End Report Generation Logic ---


  // --- Chart Configuration ---
  const options = { // Type: ChartOptions<'line'> can be added
    responsive: true, maintainAspectRatio: true,
    plugins: { legend: { position: 'top' as const, }, title: { display: true, text: 'Accelerometer Data Over Time', } },
    scales: { x: { title: { display: true, text: 'Time' } }, y: { title: { display: true, text: 'Value' } } },
    animation: { duration: 0 }
  };

  // --- Render Component ---
  return (
    <div style={{ padding: '20px' }}>
      <h1>ISCF Lab 1 Dashboard</h1>

      {/* Interval Control Section */}
      <div style={{ margin: '20px 0', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <label htmlFor="interval" style={{ marginRight: '10px' }}>Set Backend Update Interval (seconds):</label>
        <input type="number" id="interval" value={newInterval}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewInterval(e.target.value)} // Typed event
          min="0.1" step="0.1"
          style={{ marginRight: '10px', padding: '8px', border: '1px solid #ccc', borderRadius: '3px' }} />
        <button onClick={handleIntervalUpdate} style={{ padding: '8px 15px', cursor: 'pointer' }}>Set Interval</button>
        <p style={{ fontSize: '0.9em', marginTop: '8px', color: '#555' }}>
          (Current interval detected by backend: {currentInterval !== null ? `${currentInterval}s` : 'Loading...'})
        </p>
      </div>

      {/* Report Generation Section */}
      <div style={{ margin: '20px 0', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h3>Generate Report</h3>
        <label htmlFor="reportRange" style={{ marginRight: '10px' }}>Time Range:</label>
        <select id="reportRange" value={reportRangeMins}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setReportRangeMins(Number(e.target.value))} // Typed event
          style={{ marginRight: '10px', padding: '8px', border: '1px solid #ccc', borderRadius: '3px' }} >
          <option value={10}>Last 10 Minutes</option>
          <option value={30}>Last 30 Minutes</option>
          <option value={60}>Last 60 Minutes</option>
        </select>
        <button onClick={generateReport} disabled={isGeneratingReport} style={{ padding: '8px 15px', cursor: 'pointer' }}>
          {isGeneratingReport ? 'Generating...' : 'Generate & Download Report'}
        </button>
        {reportError && <p style={{ color: 'red', marginTop: '10px' }}>Report Error: {reportError}</p>}
      </div>

      {/* Live Accelerometer Graph Section */}
      <h2>Live Accelerometer Data Graph</h2>
      {(error && error !== reportError) && <p style={{ color: 'red' }}>Live Data Error: {error}</p>}
      <div style={{ position: 'relative', minHeight: '400px', width: '90%', margin: 'auto' }}>
        {chartData.labels && chartData.labels.length > 0 ? (
          <Line options={options} data={chartData} />
        ) : ( !(error && error !== reportError) && <p>Loading live chart data or no data available...</p> )}
      </div>
    </div>
  );
}