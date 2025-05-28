const { 
  log, 
  initBrowser, 
  loginToReddit, 
  sendMessageToUser,
  saveResults 
} = require('./redditUtils');

/**
 * Reddit Messenger Bot with modular structure
 */

const DEFAULT_CONFIG = {
  headless: false,
  captchaApiKey: 'YOUR_CAPTCHA_API_KEY_HERE',
  proxy: null,
  messageTemplates: [
    'Hello, I saw your post and wanted to connect!',
    'Hi there, I found your profile interesting and wanted to chat.'
  ]
};

/**
 * Main function to log in to Reddit and send a message to a user
 */
async function redditMessenger(username, password, targetUser, messageText, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  let browser = null;
  
  try {
    // Initialize browser
    const browserData = await initBrowser(options);
    browser = browserData.browser;
    const page = browserData.page;
    
    // Log in to Reddit
    await loginToReddit(page, username, password, {
      captchaApiKey: options.captchaApiKey
    });
    
    // Send message to target user
    await sendMessageToUser(page, targetUser, messageText);
    
    // Save result to organized directory structure
    const result = {
      success: [targetUser],
      message: messageText,
      timestamp: new Date().toISOString(),
      configuration: {
        headless: options.headless,
        proxyUsed: !!options.proxy
      }
    };
    
    await saveResults(result, 'single-message');
    log('Message delivery workflow completed successfully', 'SUCCESS');
    return true;
  } catch (error) {
    // Save failure information
    const failureResult = {
      failed: [{
        user: targetUser,
        error: error.message,
        timestamp: new Date().toISOString()
      }],
      configuration: {
        headless: options.headless,
        proxyUsed: !!options.proxy
      }
    };
    
    await saveResults(failureResult, 'failed-message');
    log(`Error occurred: ${error.message}`, 'ERROR');
    throw error;
  } finally {
    // Ensure browser is closed
    if (browser) {
      await browser.close();
      log('Browser session closed');
    }
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: node index.js <username> <password> <targetUser> [messageText] [proxy]');
    console.log('Example: node index.js myUsername myPassword userToMessage "Hello there!" http://proxy:8080');
    process.exit(1);
  }
  
  const username = args[0];
  const password = args[1];
  const targetUser = args[2];
  const messageText = args[3] || DEFAULT_CONFIG.messageTemplates[0];
  const proxy = args[4] || null;
  
  redditMessenger(username, password, targetUser, messageText, { proxy })
    .then(() => {
      console.log('Operation completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Operation failed:', error.message);
      process.exit(1);
    });
}

// Export the function for use as a module
module.exports = { redditMessenger };