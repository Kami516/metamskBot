// app/api/monitor/route.ts
import { NextRequest, NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID!;
const CONFIG_URL = 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/refs/heads/main/src/config.json';
const METAMASK_URL = 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/refs/heads/main/src/config.json';

interface PhishingConfig {
  blacklist: string[];
  fuzzylist: string[];
  tolerance: number;
  version: number;
  whitelist: string[];
}

let lastKnownLinks: string[] = [];
let isInitialized = false;
let monitorInterval: NodeJS.Timeout | null = null;
let isProduction = process.env.NODE_ENV === 'production';

async function fetchPhishingConfig(): Promise<PhishingConfig> {
  const response = await fetch(CONFIG_URL, { 
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache'
    }
  });
  return response.json();
}

async function sendTelegramMessage(message: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: GROUP_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    }),
  });
}

async function checkForNewLinks(): Promise<void> {
  try {
    const config = await fetchPhishingConfig();
    const currentLinks = [...config.blacklist, ...config.fuzzylist];
    
    if (!isInitialized) {
      lastKnownLinks = currentLinks;
      isInitialized = true;
      const mode = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
      console.log(`✅ Monitor initialized in ${mode} mode with ${currentLinks.length} links`);
      
      // Send startup message
      const startupMessage = `🤖 <b>Phishing Monitor Started!</b>\n\n` +
                           `🌍 Mode: <b>${mode}</b>\n` +
                           `📊 Monitoring ${currentLinks.length} known phishing links\n` +
                           `⏰ Checking every minute for new threats\n` +
                           `🔗 Source: <a href="${METAMASK_URL}">MetaMask Config</a>`;
      await sendTelegramMessage(startupMessage);
      return;
    }

    const newLinks = currentLinks.filter(link => !lastKnownLinks.includes(link));
    
    if (newLinks.length > 0) {
      for (const newLink of newLinks) {
        const message = `🚨 <b>NEW PHISHING LINK DETECTED!</b> 🚨\n\n` +
                       `🔗Found new link on MetaMask phishing list:\n` +
                       `<code>${newLink}</code>\n\n` +
                       `Total links now: ${currentLinks.length}\n\n` +
                       `📋 Check full list: <a href="${METAMASK_URL}">MetaMask Config</a>`;
        
        await sendTelegramMessage(message);
        console.log(`🚨 New link detected: ${newLink}`);
      }
      
      lastKnownLinks = currentLinks;
    } else {
      console.log(`✅ No new links found. Total: ${currentLinks.length}`);
    }
  } catch (error) {
    console.error('❌ Error checking for new links:', error);
  }
}

function startMonitoring(): void {
  if (monitorInterval) {
    console.log('⚠️ Monitor already running');
    return;
  }

  const mode = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
  console.log(`🚀 Starting phishing monitor in ${mode} mode...`);
  
  // Initial check
  checkForNewLinks();
  
  // Set up interval for every minute (60000ms)
  monitorInterval = setInterval(() => {
    checkForNewLinks();
  }, 60000);
  
  console.log('✅ Monitor started - checking every minute');
}

// Auto-start monitoring when the module loads (both dev and production)
startMonitoring();

// Production auto-trigger: Make initial request to ensure monitoring starts
if (isProduction) {
  // Wait a bit for the server to fully start, then trigger the endpoint
  setTimeout(async () => {
    try {
      const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/monitor`);
      console.log('🎯 Production auto-trigger executed');
    } catch (error) {
      console.log('📡 Production auto-trigger attempted (URL resolution may vary by platform)');
    }
  }, 5000);
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'running',
    mode: isProduction ? 'production' : 'development',
    timestamp: new Date().toISOString(),
    totalLinks: lastKnownLinks.length,
    initialized: isInitialized,
    monitoring: monitorInterval !== null
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}