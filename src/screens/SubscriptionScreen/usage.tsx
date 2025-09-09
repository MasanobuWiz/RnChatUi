// src/screens/SubscriptionScreen/usage.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import { get } from 'aws-amplify/api';
import { useEntitlements } from '../../state/subs'; // tier: 'guest' | 'free' | 'pro'

type UsageResponse = {
  month: string;           // e.g. "2025-08"
  chats: number;           // 期間内の実行回数
  limit?: number;          // フリープラン等の回数上限（無い場合は undefined）
  fastUsed?: number;       // 優先実行（Fast）利用数
  fastLimit?: number;      // 優先実行上限
  contextUsed?: number;    // 拡張コンテキストの利用回数（任意）
  contextLimit?: number;   // 拡張コンテキスト上限（任意）
  updatedAt?: string;      // 取得時刻（サーバーが付与）
};

type Tier = 'guest' | 'free' | 'pro';

/**
 * シンプルなプログレスバー（外部ライブラリ不要）
 */
function ProgressBar({ value, max }: { value: number; max?: number }) {
  const pct = useMemo(() => {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  }, [value, max]);

  return (
    <View style={{ width: '100%', height: 10, backgroundColor: '#eee', borderRadius: 999, overflow: 'hidden' }}>
      <View style={{ width: max ? `${pct}%` : '0%', height: '100%', backgroundColor: '#111' }} />
    </View>
  );
}

/**
 * 数値の簡易フォーマッタ
 */
function formatNum(n?: number) {
  if (typeof n !== 'number' || isNaN(n)) return '-';
  return n.toLocaleString();
}

/**
 * "YYYY-MM" → "2025年08月" のように整形（失敗時はそのまま）
 */
function formatMonth(m?: string) {
  if (!m) return '-';
  const [y, mo] = m.split('-');
  if (!y || !mo) return m;
  return `${y}年${mo.padStart(2, '0')}月`;
}

export default function Usage() {
  const { tier } = useEntitlements(); // 'guest' | 'free' | 'pro'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    setError(null);
    try {
      const res = await get({ apiName: 'myBedrockApi', path: '/usage' }).response;
      const json = (await res.body.json()) as UsageResponse;
      setUsage(json);
    } catch (e: any) {
      setError(e?.message ?? '使用状況の取得に失敗しました。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUsage();
  }, [fetchUsage]);

  const monthLabel = useMemo(() => formatMonth(usage?.month), [usage]);

  // Pro の場合は limit が基本 undefined 想定（上限なし）
  const hasCap = typeof usage?.limit === 'number';

  return (
    <ScrollView
      style={{ flex: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {/* ヘッダー */}
      <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e6e6e6' }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>使用状況</Text>
        <Text style={{ marginTop: 6, color: '#555' }}>
          プラン: <Text style={{ fontWeight: '700' }}>{tier.toUpperCase()}</Text>
        </Text>
        <Text style={{ marginTop: 2, color: '#777' }}>
          対象月: {monthLabel}{usage?.updatedAt ? `（更新: ${usage.updatedAt}）` : ''}
        </Text>
      </View>

      {/* 本体 */}
      <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e6e6e6', gap: 14 }}>
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 8, color: '#777' }}>読み込み中...</Text>
          </View>
        ) : error ? (
          <>
            <Text style={{ color: '#b00020' }}>{error}</Text>
            <TouchableOpacity
              onPress={fetchUsage}
              style={{ marginTop: 8, paddingVertical: 10, borderRadius: 8, backgroundColor: '#eee' }}
            >
              <Text style={{ textAlign: 'center', fontWeight: '600' }}>再試行</Text>
            </TouchableOpacity>
          </>
        ) : usage ? (
          <>
            {/* 総チャット回数 */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: '700' }}>チャット回数</Text>
              <Text style={{ color: '#555' }}>
                {formatNum(usage.chats)}
                {hasCap ? ` / ${formatNum(usage.limit)}（当月）` : '（上限なし）'}
              </Text>
              <ProgressBar value={usage.chats} max={usage.limit} />
            </View>

            {/* 優先実行（Fast）枠：APIが提供している場合のみ表示 */}
            {typeof usage.fastUsed === 'number' && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700' }}>優先実行（Fast）</Text>
                <Text style={{ color: '#555' }}>
                  {formatNum(usage.fastUsed)}
                  {typeof usage.fastLimit === 'number' ? ` / ${formatNum(usage.fastLimit)}` : '（上限なし）'}
                </Text>
                <ProgressBar value={usage.fastUsed ?? 0} max={usage.fastLimit} />
              </View>
            )}

            {/* 拡張コンテキスト枠：APIが提供している場合のみ表示 */}
            {typeof usage.contextUsed === 'number' && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700' }}>拡張コンテキスト</Text>
                <Text style={{ color: '#555' }}>
                  {formatNum(usage.contextUsed)}
                  {typeof usage.contextLimit === 'number' ? ` / ${formatNum(usage.contextLimit)}` : '（上限なし）'}
                </Text>
                <ProgressBar value={usage.contextUsed ?? 0} max={usage.contextLimit} />
              </View>
            )}

            {/* 更新ボタン */}
            <TouchableOpacity
              onPress={fetchUsage}
              style={{ marginTop: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#eee' }}
            >
              <Text style={{ textAlign: 'center', fontWeight: '600' }}>最新の情報に更新</Text>
            </TouchableOpacity>

            {/* Pro の注意書き（任意） */}
            {tier === 'pro' && (
              <Text style={{ marginTop: 2, color: '#777', fontSize: 12 }}>
                Pro は実質上限なしですが、システム保護のため内部レート制御が適用される場合があります。
              </Text>
            )}
          </>
        ) : (
          <Text style={{ color: '#777' }}>データがありません。</Text>
        )}
      </View>

      {/* モバイル時の補足（IAP運用の場合の文言） */}
      {Platform.OS !== 'web' && (
        <Text style={{ color: '#777', fontSize: 12 }}>
          ※ モバイルではストアのポリシーに従い、課金や請求はストア側で管理されます。
        </Text>
      )}
    </ScrollView>
  );
}