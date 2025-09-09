import { useState, useEffect, useRef } from 'react';
import { Message, ChatSession } from '../types';
import { sendMessageToBedrock } from '../services/bedrock';
import { dataCollectionService } from '../services/dataCollection';
import { DataTagger, createDataTagger } from '../utils/dataTagger';

const DEBUG = true;

/** エラーを人間可読に整形 */
function extractHumanMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;

  const parts: string[] = [];
  if (err.message) parts.push(err.message);
  if (err.name && err.name !== 'Error') parts.push(`(${err.name})`);

  const data = err?.response?.data ?? err?.$fault?.body ?? err?.data;
  if (data?.message && typeof data.message === 'string') {
    parts.push(`detail: ${data.message}`);
  }
  if (err?.response?.status) {
    parts.push(`status=${err.response.status}`);
  }
  if (parts.length === 0) {
    try {
      const s = JSON.stringify(err);
      parts.push(s.length > 300 ? s.slice(0, 300) + '…' : s);
    } catch {
      parts.push('Unhandled error object');
    }
  }
  return parts.join(' ');
}

export const useChat = (userId?: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [session, setSession] = useState<ChatSession | null>(null);
  const [dataTagger] = useState<DataTagger>(() => createDataTagger(userId));
  const [isLoading, setIsLoading] = useState(false);

  // ★ 即時ロック & 連打間引き（429対策）
  const inFlightRef = useRef(false);
  const lastSentRef = useRef(0);
  const MIN_GAP_MS = 1200; // 送信間隔の下限（必要に応じて調整）

  // 初期セッション生成
  useEffect(() => {
    const initialSession = dataTagger.createChatSession(undefined, {
      includeUserAgent: true,
      includeTimezone: true,
    });
    setSession(initialSession);

    if (DEBUG) {
      console.info('[chat] session started', {
        sessionId: initialSession.sessionId,
        userId: dataTagger.getUserId(),
      });
    }
  }, [dataTagger]);

  const sendMessage = async () => {
    const userQuery = input.trim();
    if (!userQuery) return;

    // ★ 二重送信を完全にブロック
    const now = performance.now();
    if (inFlightRef.current) return;
    if (now - lastSentRef.current < MIN_GAP_MS) return;
    if (isLoading) return; // 既存のガードも活かす

    inFlightRef.current = true; // 即時ロック
    setIsLoading(true);
    setInput(''); // 先に入力欄をクリア

    const t0 = performance.now();

    // 送信メッセージを追加
    const userMessage = dataTagger.tagMessage(userQuery, true);
    setMessages((prev) => [...prev, userMessage]);

    // セッションをローカル変数で追跡
    let activeSession: ChatSession | null = session;
    if (activeSession) {
      activeSession = dataTagger.addMessageToSession(activeSession, userMessage);
      setSession(activeSession);
    }

    if (DEBUG) {
      console.groupCollapsed('[chat] sendMessage');
      console.debug('→ userQuery:', userQuery);
      console.debug('→ sessionId:', activeSession?.sessionId);
    }

    try {
      // Bedrock 呼び出し
      const reply = await sendMessageToBedrock(userQuery);
      const t1 = performance.now();

      if (DEBUG) {
        console.debug('← reply:', reply);
        console.debug('latency(ms):', Math.round(t1 - t0));
      }

      // 受信メッセージを追加
      const botMessage = dataTagger.tagMessage(reply, false);
      setMessages((prev) => [...prev, botMessage]);

      // セッション更新 & 収集
      if (activeSession) {
        const finalSession = dataTagger.addMessageToSession(activeSession, botMessage);
        setSession(finalSession);

        // 収集（非同期・結果待ちしない）
        dataCollectionService
          .collectChatData(userQuery, reply, finalSession.sessionId, Math.round(t1 - t0), 'bedrock-claude')
          .catch((e) => {
            if (DEBUG) console.warn('[chat] collectChatData failed', e);
          });
      }
    } catch (err: any) {
      const human = extractHumanMessage(err);

      if (DEBUG) {
        console.error('[chat] sendMessage failed', err);
        console.error('[chat] humanized error:', human);
      }

      const errorText =
        'すみません、エラーが発生しました。\n\n' +
        `詳細: ${human}\n` +
        '※ ブラウザの開発者ツール（Console / Network）にも詳細ログがあります。';

      const errorMessage = dataTagger.tagMessage(errorText, false);
      setMessages((prev) => [...prev, errorMessage]);

      const elapsed = Math.round(performance.now() - t0);
      if (session) {
        dataCollectionService
          .collectChatData(userQuery, `Error: ${human}`, session.sessionId, elapsed, 'bedrock-claude-error')
          .catch((e) => {
            if (DEBUG) console.warn('[chat] collect error data failed', e);
          });
      }
    } finally {
      // ★ 最終的にロック解除＆最後の送信時刻を更新
      lastSentRef.current = performance.now();
      inFlightRef.current = false;

      if (DEBUG) console.groupEnd();
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    const newSession = dataTagger.createChatSession(undefined, {
      includeUserAgent: true,
      includeTimezone: true,
    });
    setSession(newSession);
    if (DEBUG) console.info('[chat] session cleared', { sessionId: newSession.sessionId });
  };

  const exportChatSession = (): string | null => {
    if (!session) return null;
    return dataTagger.exportSessionForAnalysis(session);
  };

  const getSessionInfo = () => {
    return {
      sessionId: session?.sessionId,
      userId: dataTagger.getUserId(),
      messageCount: messages.length,
      startTime: session?.startTime,
    };
  };

  // アンマウント時などにセッション情報を収集
  useEffect(() => {
    return () => {
      if (session && session.messages.length > 0) {
        dataCollectionService
          .collectSessionData(session)
          .catch((e) => DEBUG && console.warn('[chat] collectSessionData failed on cleanup', e));
      }
    };
  }, [session]);

  return {
    messages,
    input,
    setInput,
    sendMessage,
    clearChat,
    exportChatSession,
    getSessionInfo,
    isLoading,
    session,
  };
};