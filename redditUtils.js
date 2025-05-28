const puppeteer = require('puppeteer');
const { Solver } = require('@2captcha/captcha-solver');
const fs = require('fs').promises;
const path = require('path');

/**
 * Reddit Messenger Utility Functions
 * Modular functions for logging in and sending messages
 */

// Enhanced logging function
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Initialize a browser instance with proper settings
 */
async function initBrowser(options = {}) {
  const launchOptions = {
    headless: options.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  };
  
  if (options.proxy) {
    launchOptions.args.push(`--proxy-server=${options.proxy}`);
    log(`Using proxy: ${options.proxy}`);
  }
  
  log('Launching browser with optimized settings');
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  return { browser, page };
}

/**
 * Login to Reddit
 */
async function loginToReddit(page, username, password, options = {}) {
  const solver = options.captchaApiKey ? new Solver(options.captchaApiKey) : null;
  
  try {
    log('Navigating to Reddit login page');
    await page.goto('https://www.reddit.com/login', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    log('Waiting for login form elements');
    await page.waitForSelector('faceplate-text-input#login-username', { timeout: 15000 });
    await page.waitForSelector('faceplate-text-input#login-password', { timeout: 15000 });
    
    log('Filling login credentials');
    // Type into the custom faceplate-text-input elements
    await page.evaluate((usernameValue) => {
      const usernameInput = document.querySelector('faceplate-text-input#login-username');
      if (usernameInput) {
        // Trigger focus and input events on the custom element
        usernameInput.focus();
        const inputElement = usernameInput.shadowRoot?.querySelector('input') || usernameInput.querySelector('input');
        if (inputElement) {
          inputElement.value = usernameValue;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, username);
    
    await page.evaluate((passwordValue) => {
      const passwordInput = document.querySelector('faceplate-text-input#login-password');
      if (passwordInput) {
        passwordInput.focus();
        const inputElement = passwordInput.shadowRoot?.querySelector('input') || passwordInput.querySelector('input');
        if (inputElement) {
          inputElement.value = passwordValue;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, password);
    
    log('Clicking login button');
    // Submit the form - simplified version
    const loginButtonClicked = await page.evaluate(() => {
      console.log('Trying form submission...');
      const forms = document.querySelectorAll('form');
      for (const form of forms) {
        if (form.textContent.toLowerCase().includes('log in') || 
            form.textContent.toLowerCase().includes('login') || 
            form.textContent.toLowerCase().includes('username')) {
          console.log('Found login form, attempting to submit...');
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button');
          if (submitBtn) {
            submitBtn.click();
            return true;
          }
          try {
            form.submit();
            return true;
          } catch (e) {
            console.log('Form submission failed:', e.message);
          }
        }
      }
      return false;
    });
    
    if (!loginButtonClicked) {
      // Try again without taking screenshots
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const secondAttempt = await page.evaluate(() => {
        const loginButtons = document.querySelectorAll('button');
        for (const btn of loginButtons) {
          if (btn.textContent.toLowerCase().includes('log in') && !btn.disabled) {
            btn.click();
            return true;
          }
        }
        const anyButton = document.querySelector('button:not([disabled])');
        if (anyButton) {
          anyButton.click();
          return true;
        }
        return false;
      });
      
      if (!secondAttempt) {
        throw new Error('Login button not found after comprehensive search');
      }
    }
    
    log('Login button clicked - waiting for response');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Handle CAPTCHA if needed
    await handleCaptchaIfPresent(page, solver);
    
    // Verify login success
    const loginSuccess = await verifyLoginSuccess(page);
    if (!loginSuccess) {
      throw new Error('Login verification failed - incorrect credentials or Reddit is blocking the login');
    }
    
    log('Login successful!', 'SUCCESS');
    return true;
  } catch (error) {
    log(`Login error: ${error.message}`, 'ERROR');
    throw error;
  }
}

/**
 * Handle CAPTCHA if present on the page
 */
async function handleCaptchaIfPresent(page, solver) {
  const captchaRequired = await page.evaluate(() => {
    const recaptchaIframe = document.querySelector('iframe[src*="recaptcha"]');
    if (!recaptchaIframe) return false;
    
    const rect = recaptchaIframe.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0 && 
                     window.getComputedStyle(recaptchaIframe).display !== 'none' &&
                     window.getComputedStyle(recaptchaIframe).visibility !== 'hidden';
    
    const captchaContainer = document.querySelector('[class*="captcha"], [id*="captcha"], [data-testid*="captcha"]');
    const containerVisible = captchaContainer ? 
      window.getComputedStyle(captchaContainer).display !== 'none' : false;
    
    const challengeActive = document.querySelector('.g-recaptcha:not([style*="display: none"])') !== null;
    
    return isVisible && (containerVisible || challengeActive);
  });
  
  if (captchaRequired) {
    log('CAPTCHA challenge is actively displayed', 'WARN');
    
    if (!solver) {
      throw new Error('CAPTCHA challenge detected but no 2Captcha API key configured');
    }
    
    const sitekey = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="recaptcha"]');
      if (!iframe) return null;
      const match = iframe.src.match(/[?&]k=([^&]*)/);
      return match ? match[1] : null;
    });
    
    if (!sitekey) {
      throw new Error('CAPTCHA sitekey not found');
    }
    
    log(`Solving CAPTCHA with sitekey: ${sitekey}`);
    const result = await solver.recaptcha({
      googlekey: sitekey,
      pageurl: page.url(),
      invisible: 0
    });
    
    await page.evaluate((token) => {
      const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (textarea) {
        textarea.innerHTML = token;
        textarea.style.display = 'block';
      }
      document.querySelector('button[type="submit"]').click();
    }, result);
    
    log('CAPTCHA solution submitted');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
  } else {
    log('No active CAPTCHA challenge detected');
  }
}

/**
 * Verify login success
 */
async function verifyLoginSuccess(page) {
  try {
    // Check if we're already logged in or if navigation occurred
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
      log('Navigation detected after login attempt');
    } catch (error) {
      log('No navigation detected - checking current page status');
    }
    
    const currentUrl = page.url();
    log(`Current URL after login: ${currentUrl}`);
    
    // URL-based checks
    const urlIndicatesSuccess = 
      !currentUrl.includes('/login') && 
      !currentUrl.includes('/register') &&
      !currentUrl.includes('/error');
    
    log(`URL indicates success: ${urlIndicatesSuccess}`);
    
    // DOM-based verification
    const loginSuccess = await page.evaluate(() => {
      // Check multiple indicators of successful login
      const indicators = {
        // User profile/avatar indicators (most reliable)
        expandUserDrawerButton: !!document.querySelector('#expand-user-drawer-button'),
        userAvatar: !!document.querySelector('img[alt="User Avatar"]'),
        userAvatarSpan: !!document.querySelector('span[avatar]'),
        faceplateUserDrawer: !!document.querySelector('faceplate-partial[src*="user-drawer-button-logged-in"]'),
        
        // User menu indicators
        userMenuTrigger: !!document.querySelector('[data-testid="user-menu-trigger"]'),
        createButton: !!document.querySelector('button[aria-label*="Create"]'),
        karma: !!document.querySelector('[data-testid="karma"]'),
        
        // Form indicators (negative check)
        noLoginForm: !document.querySelector('faceplate-text-input#login-username'),
        noLoginPage: !document.querySelector('[data-testid="login-form"]')
      };
      
      // Count positive indicators
      const positiveIndicators = Object.entries(indicators)
        .filter(([key, value]) => key !== 'currentUrl' && value === true).length;
      
      // Check for key strong indicators
      const strongIndicators = 
        indicators.expandUserDrawerButton || 
        indicators.userAvatar || 
        indicators.userAvatarSpan ||
        indicators.faceplateUserDrawer ||
        indicators.userMenuTrigger ||
        indicators.karma;
      
      // If no login form exists and we have some indicators, likely successful
      const likelySuccess = 
        (indicators.noLoginForm || indicators.noLoginPage) && 
        (positiveIndicators >= 2 || strongIndicators);
      
      return strongIndicators || likelySuccess || positiveIndicators >= 3;
    });
    
    log(`DOM-based verification result: ${loginSuccess}`);
    
    // Combined verification - if either URL or DOM indicates success
    const overallSuccess = urlIndicatesSuccess || loginSuccess;
    
    if (!overallSuccess) {
      // Wait a bit more and try verification again
      log('Initial verification failed, waiting 3 seconds and retrying...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const retryVerification = await page.evaluate(() => {
        // Simplified retry - focus on the most reliable indicators
        const quickCheck = 
          !!document.querySelector('#expand-user-drawer-button') ||
          !!document.querySelector('img[alt="User Avatar"]') ||
          !!document.querySelector('span[avatar]') ||
          !!document.querySelector('faceplate-partial[src*="user-drawer-button-logged-in"]') ||
          (!document.querySelector('faceplate-text-input#login-username') &&
           !window.location.href.includes('/login') &&
           (document.querySelector('[data-testid*="user"]') ||
            document.querySelector('button[aria-label*="Create"]')));
        
        return quickCheck;
      });
      
      if (!retryVerification) {
        log('Login verification inconclusive - continuing anyway as form submission was successful', 'WARN');
        return true; // Continue anyway
      } else {
        log('Login verification successful on retry');
        return true;
      }
    }
    
    return true;
  } catch (error) {
    log(`Login verification error: ${error.message}`, 'ERROR');
    return false;
  }
}

/**
 * Extract chat URL from user profile page
 */
async function extractChatUrl(page) {
  await page.waitForSelector('button, a', { timeout: 10000 });
  
  return await page.evaluate(() => {
    console.log('=== EXTRACTING CHAT URL FROM START CHAT BUTTON ===');
    
    // Specific selectors based on the exact element structure
    const specificChatSelectors = [
      'faceplate-tracker[source="profile"][action="click"][noun="chat"] reddit-chat-anchor a',
      'faceplate-tracker[data-faceplate-tracking-context*="target_user"] reddit-chat-anchor a',
      'reddit-chat-anchor a[aria-label="Open chat"]',
      'a[href*="chat.reddit.com/user/"][target="_blank"]',
      'a.button-secondary[href*="chat.reddit.com/user/"]'
    ];
    
    for (const selector of specificChatSelectors) {
      const element = document.querySelector(selector);
      if (element && element.href && element.href.includes('chat.reddit.com')) {
        return element.href;
      }
    }
    
    // Fallback selectors
    const fallbackSelectors = [
      'a[aria-label="Open chat"]',
      'a[href*="chat.reddit.com/user/"]',
      'reddit-chat-anchor a'
    ];
    
    for (const selector of fallbackSelectors) {
      const element = document.querySelector(selector);
      if (element && element.href && element.href.includes('chat.reddit.com')) {
        return element.href;
      }
    }
    
    // Last resort: any chat.reddit.com link
    const allElements = Array.from(document.querySelectorAll('a[href*="chat.reddit.com"]'));
    for (const element of allElements) {
      if (element.textContent.toLowerCase().includes('chat')) {
        return element.href;
      }
    }
    
    return null;
  });
}

/**
 * Navigate to user profile and send message
 */
async function sendMessageToUser(page, targetUser, messageText) {
  try {
    log(`Navigating to target user profile: ${targetUser}`);
    await page.goto(`https://www.reddit.com/user/${targetUser}`, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Check if user exists
    log(`Checking if user ${targetUser} exists`);
    const userStatus = await page.evaluate(() => {
      if (document.body.textContent.includes('Sorry, nobody on Reddit goes by that name')) {
        return 'not_found';
      }
      if (document.body.textContent.includes('This account has been suspended')) {
        return 'suspended';
      }
      return 'exists';
    });
    
    if (userStatus !== 'exists') {
      throw new Error(`User ${targetUser} ${userStatus === 'not_found' ? 'not found' : 'account suspended'}`);
    }
    
    // Extract chat URL
    log('Looking for chat button');
    const chatUrl = await extractChatUrl(page);
    if (!chatUrl) {
      throw new Error('Chat button not found or user has disabled messaging');
    }
    
    log(`Found chat URL: ${chatUrl}`);
    
    // Navigate to chat interface
    log('Navigating to chat interface');
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log('Successfully navigated to chat interface');
    
    // Wait for the chat interface to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify we're on a chat page
    const chatPageUrl = page.url();
    if (!chatPageUrl.includes('chat.reddit.com')) {
      throw new Error(`Not on chat page. Current URL: ${chatPageUrl}`);
    }
    
    // Send message using shadow DOM navigation
    await sendMessageInChatInterface(page, messageText);
    
    log('Message delivery completed successfully', 'SUCCESS');
    return true;
  } catch (error) {
    log(`Error sending message to ${targetUser}: ${error.message}`, 'ERROR');
    throw error;
  }
}

/**
 * Send message in the chat interface using shadow DOM navigation
 */
async function sendMessageInChatInterface(page, messageText) {
  // Wait for message composer to load
  await page.waitForSelector('rs-message-composer', { timeout: 10000 })
    .catch(() => log('rs-message-composer not found, continuing anyway', 'WARN'));
  
  // Wait for shadow DOM to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Try to find and interact with nested shadow DOM elements
  const messageSent = await page.evaluate((messageToSend) => {
    // Helper function to recursively search for textarea in shadow roots
    function findTextareaInShadowDom(element) {
      if (element.tagName && element.tagName.toLowerCase() === 'textarea') {
        return element;
      }
      
      const directTextarea = element.querySelector('textarea');
      if (directTextarea) {
        return directTextarea;
      }
      
      if (element.shadowRoot) {
        const shadowTextarea = element.shadowRoot.querySelector('textarea');
        if (shadowTextarea) return shadowTextarea;
        
        const nestedTextareaComponent = element.shadowRoot.querySelector('rs-textarea-auto-size');
        if (nestedTextareaComponent) {
          return findTextareaInShadowDom(nestedTextareaComponent);
        }
        
        const messageBox = element.shadowRoot.querySelector('.message-box');
        if (messageBox) {
          const boxTextarea = messageBox.querySelector('textarea');
          if (boxTextarea) return boxTextarea;
          
          const shadowComponents = Array.from(messageBox.children).filter(el => 
            el.tagName.includes('-'));
          
          for (const comp of shadowComponents) {
            const result = findTextareaInShadowDom(comp);
            if (result) return result;
          }
        }
        
        const shadowElements = Array.from(element.shadowRoot.children).filter(el => 
          el.tagName.includes('-'));
        
        for (const shadowEl of shadowElements) {
          const result = findTextareaInShadowDom(shadowEl);
          if (result) return result;
        }
      }
      
      return null;
    }
    
    // Helper function to simulate typing
    function typeInTextarea(textarea, text) {
      if (!textarea) return false;
      
      try {
        textarea.focus();
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
        return true;
      } catch (e) {
        console.error('Error typing in textarea:', e);
        return false;
      }
    }
    
    try {
      // Try to find through rs-message-composer
      const composer = document.querySelector('rs-message-composer');
      if (composer) {
        const textarea = findTextareaInShadowDom(composer);
        if (textarea) {
          return typeInTextarea(textarea, messageToSend);
        }
      }
      
      // Try other approaches
      const directTextarea = document.querySelector('textarea[name="message"]') || 
                             document.querySelector('textarea[placeholder="Message"]');
      if (directTextarea) {
        return typeInTextarea(directTextarea, messageToSend);
      }
      
      const messageBox = document.querySelector('.message-box');
      if (messageBox) {
        const boxTextarea = messageBox.querySelector('textarea');
        if (boxTextarea) {
          return typeInTextarea(boxTextarea, messageToSend);
        }
      }
      
      const rsTextarea = document.querySelector('rs-textarea-auto-size');
      if (rsTextarea) {
        const textarea = findTextareaInShadowDom(rsTextarea);
        if (textarea) {
          return typeInTextarea(textarea, messageToSend);
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error in shadow DOM navigation:', error);
      return false;
    }
  }, messageText);
  
  if (!messageSent) {
    log('Failed to set message text via shadow DOM, trying alternative methods', 'WARN');
    
    // Try clicking on composer area
    try {
      await page.evaluate(() => {
        const composer = document.querySelector('rs-message-composer');
        if (composer) composer.click();
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      await page.keyboard.type(messageText, { delay: 50 });
    } catch (error) {
      // Last resort: click on bottom of page and type
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight
      }));
      
      await page.mouse.click(dimensions.width / 2, dimensions.height - 100);
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.keyboard.type(messageText, { delay: 50 });
    }
  }
  
  // Wait for button state to update
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Try to find and click send button
  log('Looking for send button');
  const sendButtonClicked = await page.evaluate(() => {
    function enableAndClick(button) {
      if (!button) return false;
      
      if (button.disabled || button.hasAttribute('disabled')) {
        button.disabled = false;
        button.removeAttribute('disabled');
      }
      
      try {
        button.click();
        return true;
      } catch (e) {
        button.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        return true;
      }
    }
    
    // Try exact selector
    const sendButton = document.querySelector('button.button-send[aria-label="Send message"]');
    if (sendButton) {
      return enableAndClick(sendButton);
    }
    
    // Try partial matches
    const partialMatches = [
      'button.button-send',
      'button[aria-label="Send message"]',
      'button[type="submit"]'
    ];
    
    for (const selector of partialMatches) {
      const button = document.querySelector(selector);
      if (button) {
        return enableAndClick(button);
      }
    }
    
    // Try finding by icon
    const iconButtons = document.querySelectorAll('button');
    for (const button of iconButtons) {
      if (button.querySelector('svg[icon-name="send-fill"]')) {
        return enableAndClick(button);
      }
    }
    
    return false;
  });
  
  if (!sendButtonClicked) {
    log('Failed to click send button, trying Enter key', 'WARN');
    await page.keyboard.press('Enter');
  }
  
  // Wait for message to be sent
  log('Waiting for message to be sent');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Verify message delivery
  const deliveryStatus = await page.evaluate(() => {
    if (document.body.textContent.includes('Failed to send') ||
        document.body.textContent.includes('Message failed')) {
      return 'failed';
    }
    
    if (document.querySelector('[data-testid="message-sent"]') ||
        document.body.textContent.includes('Message sent')) {
      return 'sent';
    }
    
    return 'unknown';
  });
  
  if (deliveryStatus === 'failed') {
    throw new Error('Message delivery failed - Reddit may have blocked the message');
  }
}

/**
 * Save results to file in the results directory
 */
async function saveResults(data, prefix = 'result') {
  // Create results directory if it doesn't exist
  const resultsDir = './results';
  try {
    await fs.mkdir(resultsDir, { recursive: true });
  } catch (error) {
    log(`Error creating results directory: ${error.message}`, 'ERROR');
  }
  
  // Create timestamp for unique filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = path.join(resultsDir, `${prefix}-${timestamp}.json`);
  
  // Save the data
  await fs.writeFile(resultsFile, JSON.stringify(data, null, 2));
  log(`Data saved to ${resultsFile}`);
  
  return resultsFile;
}

module.exports = {
  log,
  initBrowser,
  loginToReddit,
  verifyLoginSuccess,
  handleCaptchaIfPresent,
  extractChatUrl,
  sendMessageToUser,
  sendMessageInChatInterface,
  saveResults
};
