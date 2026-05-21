#!/usr/bin/env node

/**
 * Safe Firebase Deployment Script for Skyelineos
 * Implements pre-deploy checks and staging workflow
 */

import { spawn } from 'child_process';
import fs from 'fs';

const PROD_PROJECT = 'skyelineos';
const DEV_PROJECT = 'custom-home-suite';

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🔄 Running: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, { 
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    });
    
    let output = '';
    if (options.silent && proc.stdout) {
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
    }
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

function checkFirebaseRC() {
  console.log('🔍 Checking .firebaserc configuration...');
  
  if (!fs.existsSync('.firebaserc')) {
    throw new Error('.firebaserc not found');
  }
  
  const config = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
  if (config.projects.prod !== PROD_PROJECT) {
    throw new Error(`Production project mismatch. Expected: ${PROD_PROJECT}`);
  }
  
  console.log('✅ .firebaserc looks good');
}

async function getCurrentProject() {
  try {
    const output = await runCommand('firebase', ['use'], { silent: true });
    const match = output.match(/Active project:\s+(\S+)/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

async function deployToStaging() {
  console.log('🚀 Creating staging deployment...');
  
  const channelId = `staging-${Date.now()}`;
  
  try {
    await runCommand('firebase', [
      'hosting:channel:deploy', channelId,
      '--project', PROD_PROJECT,
      '--expires', '7d'
    ]);
    
    console.log(`✅ Staging deployed to channel: ${channelId}`);
    console.log(`🌐 Preview URL: https://skyelineos--${channelId}.web.app`);
    
    return channelId;
  } catch (error) {
    console.error('❌ Staging deployment failed:', error.message);
    throw error;
  }
}

async function deployToProd() {
  console.log('🚀 Deploying to production...');
  
  try {
    await runCommand('firebase', [
      'deploy',
      '--only', 'hosting,firestore:rules',
      '--project', PROD_PROJECT
    ]);
    
    console.log('✅ Production deployment completed!');
    console.log('🌐 Live URL: https://skyelineos.web.app');
  } catch (error) {
    console.error('❌ Production deployment failed:', error.message);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isProduction = args.includes('--prod');
  const isStaging = args.includes('--staging');
  
  try {
    console.log('🔍 Running pre-deployment checks...');
    
    // Check configuration
    checkFirebaseRC();
    
    // Verify current project
    const currentProject = await getCurrentProject();
    console.log(`📋 Current project: ${currentProject}`);
    
    // Build the app
    console.log('🏗️  Building application...');
    await runCommand('npm', ['run', 'build']);
    
    if (isStaging || (!isProduction && !isStaging)) {
      // Default to staging
      await deployToStaging();
    }
    
    if (isProduction) {
      const confirmed = process.env.CONFIRM_PROD_DEPLOY === 'true';
      
      if (!confirmed) {
        console.log('⚠️  Production deployment requires confirmation.');
        console.log('Set CONFIRM_PROD_DEPLOY=true to proceed.');
        process.exit(1);
      }
      
      await deployToProd();
    }
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}