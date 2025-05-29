const { 
  log, 
  initBrowser, 
  loginToReddit, 
  sendMessageToUser,
  saveResults 
} = require('./redditUtils');

require("dotenv").config();

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

const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;
const targetUser = "the_marketing_geek";
const messageText = `
Hi the_marketing_geek.

I see that you post a lot in the marketing subreddit. Ever wish that you cross-post to multiple subreddits on different days?
`;

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

redditMessenger(redditUsername, redditPassword, targetUser, messageText);

// Export the function for use as a module
module.exports = { redditMessenger };