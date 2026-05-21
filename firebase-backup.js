#!/usr/bin/env node

/**
 * Firebase Backup Script for Skyelineos Construction Management
 * Run weekly to backup Firestore data
 */

const { spawn } = require('child_process');

const PROJECT_ID = 'skyelineos';
const BACKUP_BUCKET = 'gs://skyelineos.appspot.com';

function formatDate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit' });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

async function backupFirestore() {
  console.log('🔄 Starting Firestore backup...');
  
  const backupPath = `${BACKUP_BUCKET}/firestore/${formatDate()}`;
  
  try {
    await runCommand('gcloud', [
      'firestore', 'export',
      backupPath,
      `--project=${PROJECT_ID}`
    ]);
    
    console.log('✅ Firestore backup completed:', backupPath);
  } catch (error) {
    console.error('❌ Firestore backup failed:', error.message);
    throw error;
  }
}

async function enableStorageVersioning() {
  console.log('🔄 Enabling Storage versioning...');
  
  try {
    await runCommand('gsutil', [
      'versioning', 'set', 'on',
      `${BACKUP_BUCKET}`
    ]);
    
    console.log('✅ Storage versioning enabled');
  } catch (error) {
    console.warn('⚠️  Storage versioning setup failed:', error.message);
  }
}

async function main() {
  try {
    console.log(`🚀 Starting backup for project: ${PROJECT_ID}`);
    console.log(`📅 Date: ${formatDate()}`);
    
    await backupFirestore();
    await enableStorageVersioning();
    
    console.log('✅ All backups completed successfully!');
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { backupFirestore, enableStorageVersioning };