/**
 * Kamui TaskBoard Storage Module
 * 
 * タスクボードのデータ永続化を管理する独立モジュール
 * main.jsとは独立して動作し、main.jsの更新でデータが失われないようにする
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'kamui_task_board_v1';
  const STORAGE_VERSION = 4;
  const STORAGE_BACKUP_KEY = 'kamui_task_board_backup';
  const MAX_TASK_HISTORY = 40;
  const MAX_TASK_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14日間保持
  const MAX_LOG_LENGTH = 20000; // 20KBぶんだけ保持

  // グローバルに公開するAPI
  window.KamuiTaskBoardStorage = {
    // ストレージからデータを読み込む
    load: function() {
      try {
        let raw = localStorage.getItem(STORAGE_KEY);
        
        // メインデータがない場合、バックアップから復元を試みる
        if (!raw) {
          const backup = localStorage.getItem(STORAGE_BACKUP_KEY);
          if (backup) {
            console.warn('[TaskBoardStorage] Main data not found, attempting to restore from backup...');
            raw = backup;
            // バックアップからメインに復元
            localStorage.setItem(STORAGE_KEY, backup);
          } else {
            return null;
          }
        }
        
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object') return null;
        
        // バージョンが異なる場合でもデータを削除せず、可能な限り移行する
        if (saved.version !== STORAGE_VERSION) {
          console.warn(`[TaskBoardStorage] Version mismatch: expected ${STORAGE_VERSION}, got ${saved.version}. Attempting migration...`);
          // 古いバージョンのデータでも、tasksがあれば読み込む
          if (saved.tasks && Array.isArray(saved.tasks)) {
            console.log(`[TaskBoardStorage] Migrating ${saved.tasks.length} tasks from version ${saved.version} to ${STORAGE_VERSION}`);
          }
        }
        
        return saved;
      } catch (err) {
        console.error('[TaskBoardStorage] Failed to load data:', err);
        return null;
      }
    },

    // ストレージにデータを保存する
    save: function(data) {
      try {
        // 現在のデータをバックアップ（念のため）
        const current = localStorage.getItem(STORAGE_KEY);
        if (current) {
          localStorage.setItem(STORAGE_BACKUP_KEY, current);
          console.log('[TaskBoardStorage] Created backup of current data');
        }

        const payload = {
          version: STORAGE_VERSION,
          ...data,
          persistedAt: new Date().toISOString()
        };
        
        // 空配列で過去の非空スナップショットを潰さない
        try {
          const prev = current ? JSON.parse(current) : null;
          const prevLen = Array.isArray(prev && prev.tasks) ? prev.tasks.length : 0;
          const nextLen = Array.isArray(payload && payload.tasks) ? payload.tasks.length : 0;
          if (nextLen === 0 && prevLen > 0) {
            console.warn('[TaskBoardStorage] Skip save: avoid overwriting non-empty snapshot with empty list');
            return prev && prev.persistedAt ? prev.persistedAt : null;
          }
        } catch(_) {}

        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        console.log('[TaskBoardStorage] Data saved successfully');
        return payload.persistedAt;
      } catch (err) {
        console.error('[TaskBoardStorage] Failed to save data:', err);
        return null;
      }
    },

    // タスクログキャッシュを保存
    saveTaskLogs: function(logs) {
      try {
        const key = STORAGE_KEY + '_logs';
        if (!logs || typeof logs !== 'object') {
          localStorage.removeItem(key);
          return;
        }
        
        // ログサイズの制限
        const trimmed = {};
        Object.keys(logs).forEach(taskId => {
          const log = logs[taskId];
          if (typeof log === 'string' && log.trim()) {
            trimmed[taskId] = log.length > MAX_LOG_LENGTH 
              ? log.slice(-MAX_LOG_LENGTH) 
              : log;
          }
        });
        
        if (Object.keys(trimmed).length > 0) {
          localStorage.setItem(key, JSON.stringify(trimmed));
        } else {
          localStorage.removeItem(key);
        }
      } catch (err) {
        console.error('[TaskBoardStorage] Failed to save task logs:', err);
      }
    },

    // タスクログキャッシュを読み込み
    loadTaskLogs: function() {
      try {
        const key = STORAGE_KEY + '_logs';
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        
        const logs = JSON.parse(raw);
        if (!logs || typeof logs !== 'object') return {};
        
        return logs;
      } catch (err) {
        console.error('[TaskBoardStorage] Failed to load task logs:', err);
        return {};
      }
    },

    // バックアップからの復元
    restoreFromBackup: function() {
      const backup = localStorage.getItem(STORAGE_BACKUP_KEY);
      if (!backup) {
        console.error('[TaskBoardStorage] No backup data found');
        return false;
      }
      
      try {
        const backupData = JSON.parse(backup);
        console.log(`[TaskBoardStorage] Backup data: ${backupData.tasks?.length || 0} tasks`);
        console.log('[TaskBoardStorage] Backup time:', backupData.persistedAt);
        
        if (confirm('バックアップからタスクを復元しますか？現在のデータは上書きされます。')) {
          localStorage.setItem(STORAGE_KEY, backup);
          location.reload();
          return true;
        }
      } catch (err) {
        console.error('[TaskBoardStorage] Failed to parse backup data:', err);
      }
      return false;
    },

    // ストレージ状態を確認
    getStatus: function() {
      const current = localStorage.getItem(STORAGE_KEY);
      const backup = localStorage.getItem(STORAGE_BACKUP_KEY);
      
      console.log('=== TaskBoard Storage Status ===');
      
      if (current) {
        try {
          const currentData = JSON.parse(current);
          console.log('Current data:');
          console.log(`  - Tasks: ${currentData.tasks?.length || 0}`);
          console.log(`  - Saved at: ${currentData.persistedAt || 'unknown'}`);
          console.log(`  - Version: ${currentData.version || 'unknown'}`);
        } catch (err) {
          console.error('Current data parse error:', err);
        }
      } else {
        console.log('Current data: none');
      }
      
      if (backup) {
        try {
          const backupData = JSON.parse(backup);
          console.log('\nBackup data:');
          console.log(`  - Tasks: ${backupData.tasks?.length || 0}`);
          console.log(`  - Saved at: ${backupData.persistedAt || 'unknown'}`);
          console.log(`  - Version: ${backupData.version || 'unknown'}`);
        } catch (err) {
          console.error('Backup data parse error:', err);
        }
      } else {
        console.log('\nBackup data: none');
      }
      
      console.log('\nTo restore: window.kamuiTaskBoardRecover()');
    },

    // ストレージをクリア（危険）
    clearAll: function() {
      if (confirm('すべてのタスクデータを削除しますか？この操作は取り消せません。')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY + '_logs');
        localStorage.removeItem(STORAGE_BACKUP_KEY);
        console.log('[TaskBoardStorage] All data cleared');
        location.reload();
      }
    },

    // バージョン情報
    getVersion: function() {
      return STORAGE_VERSION;
    },

    // ストレージキー
    getStorageKey: function() {
      return STORAGE_KEY;
    }
  };

  // グローバル復旧関数
  window.kamuiTaskBoardRecover = function() {
    return window.KamuiTaskBoardStorage.restoreFromBackup();
  };

  // グローバル状態確認関数
  window.kamuiTaskBoardStatus = function() {
    return window.KamuiTaskBoardStorage.getStatus();
  };

  console.log('[TaskBoardStorage] Storage module loaded. Version:', STORAGE_VERSION);
})();
