'use client';

import { useState, useEffect } from 'react';

interface MonitorStatus {
  status: string;
  timestamp: string;
  totalLinks: number;
  initialized: boolean;
}

export default function Home() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/monitor');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error checking status:', error);
    }
  };

  useEffect(() => {
    if (isRunning) {
      // Check immediately
      checkStatus();
      
      // Then check every minute
      const interval = setInterval(checkStatus, 60000);
      return () => clearInterval(interval);
    }
  }, [isRunning]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
          <h1 className="text-3xl font-bold mb-6 text-center">
            🤖 Telegram Phishing Monitor Bot
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-700 p-4 rounded-lg">
              <h2 className="text-xl font-semibold mb-2">📊 Configuration</h2>
              <p className="text-gray-300 mb-1">
                <span className="font-medium">Target URL:</span> MetaMask Phishing Config
              </p>
              <p className="text-gray-300 mb-1">
                <span className="font-medium">Check Interval:</span> Every minute
              </p>
              <p className="text-gray-300">
                <span className="font-medium">Telegram Group:</span> Connected
              </p>
            </div>
            
            <div className="bg-gray-700 p-4 rounded-lg">
              <h2 className="text-xl font-semibold mb-2">🎯 Status</h2>
              {status ? (
                <>
                  <p className="text-gray-300 mb-1">
                    <span className="font-medium">State:</span> 
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${
                      status.initialized ? 'bg-green-600' : 'bg-yellow-600'
                    }`}>
                      {status.initialized ? 'Monitoring' : 'Initializing'}
                    </span>
                  </p>
                  <p className="text-gray-300 mb-1">
                    <span className="font-medium">Total Links:</span> {status.totalLinks}
                  </p>
                  <p className="text-gray-300 text-sm">
                    <span className="font-medium">Last Check:</span> {
                      new Date(status.timestamp).toLocaleTimeString()
                    }
                  </p>
                </>
              ) : (
                <p className="text-gray-400">Not started</p>
              )}
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                isRunning 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isRunning ? '⏹️ Stop Monitor' : '▶️ Start Monitor'}
            </button>
          </div>

          <div className="mt-8 bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">ℹ️ How it works</h3>
            <ul className="text-gray-300 space-y-1 text-sm">
              <li>• Monitors MetaMask's phishing detection config every minute</li>
              <li>• Detects new malicious links added to the blacklist/fuzzylist</li>
              <li>• Sends alerts to your Telegram group when new threats are found</li>
              <li>• Runs continuously while the monitor is active</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}