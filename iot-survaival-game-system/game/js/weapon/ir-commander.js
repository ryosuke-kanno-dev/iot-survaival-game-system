// 役割：IR信号の送信処理

import { logger } from '../ui/ui-log.js';

class IRCommander {
  constructor() {
    this.isSending = false;
  }

  // IR信号送信
  async send(command, characteristic) {
    if (!characteristic) {
      logger.error("characteristic が null です");
      return false;
    }

    if (this.isSending) {
      logger.warn("送信中です。しばらくお待ちください");
      return false;
    }

    try {
      this.isSending = true;
      logger.info(`IR送信: ${command}`);

      await characteristic.writeValue(new TextEncoder().encode(command));

      logger.success(`IR送信完了: ${command}`);
      return true;

    } catch (error) {
      logger.error(`IR送信エラー: ${error.message}`);
      return false;

    } finally {
      this.isSending = false;
    }
  }

  // 送信中かどうか
  isBusy() {
    return this.isSending;
  }
}

export const irCommander = new IRCommander();