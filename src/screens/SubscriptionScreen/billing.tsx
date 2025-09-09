// src/screens/SubscriptionScreen/billing.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Linking } from 'react-native';
import { get } from 'aws-amplify/api';

type Invoice = {
  id: string;
  amount: string;        // "¥2,800" など（API側で整形して返す想定。数値ならここで整形してOK）
  createdAt: string;     // ISO or 表示用文字列
  url?: string;          // 領収書/PDF など
};

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [portalUrl, setPortalUrl] = useState<string | undefined>();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isWeb = Platform.OS === 'web';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 請求ポータルURL（Web=Stripe Billing Portal、Mobile=案内/任意URL）
      const r1 = await (await get({ apiName: 'myBedrockApi', path: '/billing/portal' }).response).body.json();
      setPortalUrl(r1?.url);

      // 請求履歴
      const r2 = await (await get({ apiName: 'myBedrockApi', path: '/billing/invoices' }).response).body.json();
      setInvoices(Array.isArray(r2?.items) ? r2.items : []);
    } catch (e: any) {
      setError(e?.message ?? '請求情報の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openPortal = () => {
    if (!portalUrl) return;
    if (isWeb) {
      (window as any).location.assign(portalUrl);
    } else {
      Linking.openURL(portalUrl);
    }
  };

  // モバイル（IAP運用）の場合の補助導線（必要に応じて表示）
  const openNativeSubscriptions = () => {
    if (Platform.OS === 'ios') {
      // iOS のサブスクリプション管理（開けない環境もあるためフォールバック扱い）
      Linking.openURL('itms-apps://apps.apple.com/account/subscriptions');
    } else if (Platform.OS === 'android') {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {/* 支払い方法 / 管理 */}
      <View style={{ padding: 16, borderWidth: 1, borderColor: '#e6e6e6', borderRadius: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>支払い方法</Text>
        <Text style={{ color: '#555', marginTop: 6 }}>
          {isWeb
            ? 'カード情報・請求先の更新は以下から管理できます。'
            : 'モバイルの課金はストアのサブスクリプションで管理します。'}
        </Text>

        {loading ? (
          <View style={{ marginTop: 10 }}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            {isWeb ? (
              <TouchableOpacity
                onPress={openPortal}
                disabled={!portalUrl}
                style={{
                  marginTop: 10,
                  padding: 12,
                  backgroundColor: portalUrl ? 'black' : '#cfcfcf',
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
                  請求の管理を開く
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={openNativeSubscriptions}
                style={{ marginTop: 10, padding: 12, backgroundColor: 'black', borderRadius: 8 }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
                  サブスクリプションを管理（ストア）
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* 請求履歴 */}
      <View style={{ padding: 16, borderWidth: 1, borderColor: '#e6e6e6', borderRadius: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>請求履歴</Text>

        {loading && (
          <View style={{ marginTop: 10 }}>
            <ActivityIndicator />
          </View>
        )}

        {!loading && error && (
          <Text style={{ color: '#b00020', marginTop: 8 }}>{error}</Text>
        )}

        {!loading && !error && invoices.length === 0 && (
          <Text style={{ color: '#777', marginTop: 6 }}>請求はまだありません</Text>
        )}

        {!loading &&
          !error &&
          invoices.map((inv) => (
            <View
              key={inv.id}
              style={{ marginTop: 10, padding: 12, borderRadius: 8, backgroundColor: '#f8f8f8' }}
            >
              <Text>請求ID: {inv.id}</Text>
              <Text>金額: {inv.amount}</Text>
              <Text>日付: {inv.createdAt}</Text>
              {inv.url ? (
                <Text
                  style={{ color: '#0a84ff', marginTop: 4 }}
                  onPress={() => Linking.openURL(inv.url!)}
                >
                  領収書を表示
                </Text>
              ) : null}
            </View>
          ))}

        {!loading && (
          <TouchableOpacity
            onPress={fetchAll}
            style={{ marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: '#eee' }}
          >
            <Text style={{ textAlign: 'center', fontWeight: '600' }}>最新の情報に更新</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}