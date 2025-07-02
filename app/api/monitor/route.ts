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

interface ChainAbuseResult {
  totalReports: number;
  found: boolean;
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

async function checkChainAbuseReports(domain: string): Promise<ChainAbuseResult> {
  try {
    // Ensure domain has protocol
    const fullUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    const encodedUrl = encodeURIComponent(fullUrl);
    const chainAbuseUrl = `https://www.chainabuse.com/domain/${encodedUrl}`;
    
    console.log(`🔍 Checking ChainAbuse for: ${domain}`);
    
    const response = await fetch(chainAbuseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      console.log(`❌ ChainAbuse request failed for ${domain}: ${response.status}`);
      return { totalReports: 0, found: false };
    }

    const html = await response.text();
    
    // Look for the pattern "X Scam Reports" in the HTML
    const reportMatch = html.match(/(\d+)\s+Scam\s+Reports?/i);
    
    if (reportMatch) {
      const reportCount = parseInt(reportMatch[1], 10);
      console.log(`✅ Found ${reportCount} reports for ${domain}`);
      return { totalReports: reportCount, found: true };
    }

    // Alternative patterns to look for
    const altPatterns = [
      /Reports\s+submitted\s+for[^>]*>([^<]*)</i,
      /(\d+)\s+reports?\s+found/i,
      /Total\s+reports?:\s*(\d+)/i
    ];

    for (const pattern of altPatterns) {
      const match = html.match(pattern);
      if (match) {
        const reportCount = parseInt(match[1], 10);
        if (!isNaN(reportCount)) {
          console.log(`✅ Found ${reportCount} reports for ${domain} (alt pattern)`);
          return { totalReports: reportCount, found: true };
        }
      }
    }

    // Check if the page exists but has no reports
    if (html.includes('chainabuse') && html.includes(domain.replace(/https?:\/\//, ''))) {
      console.log(`📋 Domain ${domain} found on ChainAbuse but no reports detected`);
      return { totalReports: 0, found: true };
    }

    console.log(`❓ No reports found for ${domain}`);
    return { totalReports: 0, found: false };

  } catch (error) {
    console.error(`❌ Error checking ChainAbuse for ${domain}:`, error);
    return { totalReports: 0, found: false };
  }
}

async function sendTelegramMessage(message: string): Promise<void> {
  try {
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
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
  } catch (error) {
    console.error('❌ Error sending Telegram message:', error);
  }
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
      console.log(`🚨 Found ${newLinks.length} new links, checking ChainAbuse...`);
      
      // Check all new links against ChainAbuse
      const chainAbuseResults = await Promise.allSettled(
        newLinks.map(async (link) => {
          const result = await checkChainAbuseReports(link);
          return { link, ...result };
        })
      );

      // Calculate total reports from successful checks
      let totalChainAbuseReports = 0;
      const successfulResults = chainAbuseResults
        .filter((result): result is PromiseFulfilledResult<{ link: string; totalReports: number; found: boolean }> => 
          result.status === 'fulfilled')
        .map(result => result.value);

      totalChainAbuseReports = successfulResults.reduce((sum, result) => sum + result.totalReports, 0);

      // Create single message for all new links (like original)
      let message = `🚨 <b>NEW PHISHING LINK DETECTED!</b> 🚨\n\n`;
      
      if (newLinks.length === 1) {
        message += `🔗 New link on MetaMask phishing list:\n<code>${newLinks[0]}</code>\n\n`;
      } else {
        message += `🔗 Found ${newLinks.length} new links on MetaMask phishing list:\n`;
        newLinks.forEach(link => {
          message += `<code>${link}</code>\n`;
        });
        message += `\n`;
      }
      
      message += `📊 Total MetaMask links now: ${currentLinks.length}\n\n`;
      
      // Add ChainAbuse summary
      if (totalChainAbuseReports > 0) {
        message += `🕵️ ChainAbuse: Found <b>${totalChainAbuseReports}</b> reports total\n\n`;
      } else {
        message += `🕵️ ChainAbuse: No reports found\n\n`;
      }
      
      message += `📋 Check full MetaMask list: <a href="${METAMASK_URL}">MetaMask Config</a>`;
      
      await sendTelegramMessage(message);
      console.log(`🚨 New links detected and message sent: ${newLinks.join(', ')}`);
      
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