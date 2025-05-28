const fs = require('fs').promises;
const { 
  log, 
  initBrowser, 
  loginToReddit, 
  sendMessageToUser,
  saveResults
} = require('./redditUtils');

/**
 * Optimized batch messaging script for Reddit
 * Logs in once and reuses the browser session for all messages
 */

async function processOptimizedBatch(username, password, usersFile, messageText, options = {}) {
  let browser = null, page = null;
  
  try {
    // Load target users
    log(`Loading target users from ${usersFile}`);
    const usersData = await fs.readFile(usersFile, 'utf8');
    const users = usersData
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    log(`Loaded ${users.length} valid usernames from ${usersFile}`);
    
    // Initialize browser once for all messages
    const browserData = await initBrowser({
      headless: options.headless !== false,
      proxy: options.proxy
    });
    browser = browserData.browser;
    page = browserData.page;
    
    // Login once for all messages
    log('Logging in to Reddit - this will be done only once for all messages');
    await loginToReddit(page, username, password, {
      captchaApiKey: options.captchaApiKey
    });
    
    // Results tracking
    const results = {
      success: [],
      failed: []
    };
    
    // Get delay between messages
    const delay = options.delay || 30000; // Default 30 seconds
    log(`Starting batch processing with ${users.length} users`);
    log(`Delay between messages: ${delay/1000} seconds`);
    
    // Process each user with the same browser session
    for (let i = 0; i < users.length; i++) {
      const targetUser = users[i];
      log(`\nProcessing user ${i+1}/${users.length}: ${targetUser}`, 'PROCESS');
      
      try {
        // Send message to this user (reusing the logged-in session)
        await sendMessageToUser(page, targetUser, messageText);
        
        log(`✓ Successfully messaged ${targetUser}`, 'SUCCESS');
        results.success.push(targetUser);
      } catch (error) {
        log(`✗ Failed to message ${targetUser}: ${error.message}`, 'ERROR');
        results.failed.push({
          user: targetUser,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // Add delay between requests to avoid rate limiting
      if (i < users.length - 1) {
        log(`Waiting ${delay/1000} seconds before next user...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Print summary
    log('\n--- BATCH PROCESSING SUMMARY ---');
    log(`Total users: ${users.length}`);
    log(`Successful: ${results.success.length}`, results.success.length === users.length ? 'SUCCESS' : 'INFO');
    log(`Failed: ${results.failed.length}`, results.failed.length > 0 ? 'WARN' : 'INFO');
    
    // Save results to organized directory structure using the utility function
    const resultsFile = await saveResults(results, 'batch');
    log(`Results saved to ${resultsFile}`);
    
    return results;
  } catch (error) {
    log(`Batch processing error: ${error.message}`, 'ERROR');
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
  
  if (args.length < 4) {
    console.log('Usage: node optimizedBatch.js <username> <password> <usersFile> <messageText> [proxy] [delay]');
    console.log('Example: node optimizedBatch.js myUsername myPassword users.txt "Hello there!" http://proxy:8080 60000');
    process.exit(1);
  }
  
  const username = args[0];
  const password = args[1];
  const usersFile = args[2];
  const messageText = args[3];
  const proxy = args[4] || null;
  const delay = args[5] ? parseInt(args[5]) : 30000;
  
  processOptimizedBatch(username, password, usersFile, messageText, { 
    proxy, 
    delay,
    headless: false
  })
    .then(() => {
      log('Batch processing completed successfully.', 'SUCCESS');
      process.exit(0);
    })
    .catch((error) => {
      log(`Batch processing failed: ${error.message}`, 'ERROR');
      process.exit(1);
    });
}

module.exports = { processOptimizedBatch };
