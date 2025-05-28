# Reddit Messenger Bot

A powerful Node.js application that uses Puppeteer to automate Reddit login and message sending, with support for both single-user and batch messaging.

## Features

- **Single-User Messaging**: Send messages to individual Reddit users
- **Optimized Batch Messaging**: Send messages to multiple users with a single login session
- **Modular Architecture**: Reusable components for custom integration
- **Shadow DOM Support**: Properly handles Reddit's complex DOM structure
- **CAPTCHA Detection**: Supports 2Captcha for automated CAPTCHA solving
- **Proxy Support**: Route traffic through proxy servers for improved anonymity
- **Detailed Logging**: Comprehensive logging of all operations
- **Error Handling**: Robust error handling for common issues
- **Structured Results**: Results saved in organized JSON format with timestamps

## System Architecture

The application consists of three main JavaScript files:

1. **index.js** - Single-user messaging script
2. **optimizedBatch.js** - Efficient batch messaging that reuses login sessions
3. **redditUtils.js** - Core utility functions for Reddit operations

## Installation

1. Clone this repository to your local machine
2. Install dependencies:

```bash
npm install
```

## Usage

### Single-User Messaging

Use `index.js` when you need to send a message to a single Reddit user:

```bash
node index.js <username> <password> <targetUser> [messageText] [proxy]
```

Example:

```bash
node index.js myRedditUsername myPassword userToMessage "Hello, I saw your post and wanted to connect!"
```

### Batch Messaging (Optimized)

Use `optimizedBatch.js` for efficiently messaging multiple users with a single login session:

```bash
node optimizedBatch.js <username> <password> <usersFile> <messageText> [proxy] [delay]
```

Example:

```bash
node optimizedBatch.js myRedditUsername myPassword users.txt "Hello there!" http://proxy-server:port 60000
```

#### Parameters Explained:

- **username**: Your Reddit account username
- **password**: Your Reddit account password
- **targetUser/usersFile**: Either a single username or path to a text file with usernames (one per line)
- **messageText**: The message content to send (in quotes)
- **proxy** (optional): HTTP proxy server URL (format: http://user:pass@host:port)
- **delay** (optional): Delay between messages in milliseconds (default: 30000 ms, or 30 seconds)

### Users File Format

The users file should contain one Reddit username per line. Lines starting with `#` are ignored as comments:

```
username1
username2
# This is a comment
username3
```

## Configuration

You can modify the default configuration in the `DEFAULT_CONFIG` object in `index.js`:

- `headless`: Run browser in headless mode (default: false)
- `captchaApiKey`: Your 2Captcha API key (if you want automatic CAPTCHA solving)
- `proxy`: Proxy server to use
- `messageTemplates`: Default message templates to use if no message is provided

## Common Issues Handled

- Username not found
- User has disabled chat
- User account suspended
- CAPTCHA challenges
- Login failures
- Message delivery failures

## Using as a Module

You can also use this script as a module in your own projects:

```javascript
const { redditMessenger } = require('./index');

redditMessenger('username', 'password', 'targetUser', 'Hello!', {
  headless: true,
  proxy: 'http://myproxy:8080'
})
.then(() => console.log('Message sent successfully'))
.catch(err => console.error('Error:', err));
```# reddit-automation
