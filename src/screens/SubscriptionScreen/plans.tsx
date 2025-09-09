// src/screens/SubscriptionScreen/plans.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { post } from 'aws-amplify/api';
import { useEntitlements } from '../../state/subs'; // tier: 'guest' | 'free' | 'pro'

type Tier = 'guest' | 'free' | 'pro';

type FeatureKey = 'fast' | 'models' | 'attachments' | 'contexts' | 'knowledge';

const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: 'fast',        label: '優先実行（ピーク時でも高速）' },
  { key: 'models',      label: '高性能モデル（Claude/Llama/Titan 等）' },
  { key: 'attachments', label: 'ファイル/画像入力' },
  { key: 'contexts',    label: '長文コンテキスト（拡張）' },
  { key: 'knowledge',   label: 'ナレッジベース/RAG' },
];

type Plan = {
  id: 'free' | 'pro';
  title: string;
  price: string;
  note?: string;
  cta: string;                    // 利用中 / アップグレード / 切替
  features: Record<FeatureKey, boolean>;
  elevated: boolean;              // 視覚的に強調するか（Proを黒背景に）
};

function FeatureRow({ on, dim }: { on: boolean; dim: boolean }) {
  return (
    <Text style={{ color: on ? (dim ? '#fff' : '#111') : '#999' }}>
      {on ? '●' : '○'}{' '}
    </Text>
  );
}

export default function Plans() {
  const { tier } = useEntitlements(); // 現在のプラン
  const [yearly, setYearly] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<null | 'free' | 'pro'>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const plans = useMemo<Plan[]>(() => [
    {
      id: 'free',
      title: 'Free',
      price: yearly ? '¥0/月' : '¥0/月',
      cta: tier === 'free' ? '利用中' : '切替',
      features: { fast: false, models: true, attachments: true, contexts: false, knowledge: false },
      elevated: false,
    },
    {
      id: 'pro',
      title: 'Pro',
      price: yearly ? '¥2,400/月（年払）' : '¥2,800/月（毎月）',
      note: yearly ? '※年額一括がお得' : undefined,
      cta: tier === 'pro' ? '利用中' : 'アップグレード',
      features: { fast: true, models: true, attachments: true, contexts: true, knowledge: true },
      elevated: true,
    },
  ], [yearly, tier]);

  const onUpgrade = useCallback(async (planId: 'free' | 'pro') => {
    setErrorMsg(null);

    // Freeへのダウングレード処理（必要なら実装）
    if (planId === 'free') {
      Alert.alert('情報', 'Freeプランへの切替は、請求サイクル終了後に反映されます。');
      return;
    }

    // Proへのアップグレード
    try {
      setLoadingPlan('pro');

      if (Platform.OS === 'web') {
        // Web: Stripe Checkout へリダイレクトURLを取得
        const res = await (await post({
          apiName: 'myBedrockApi',
          path: '/billing/checkout',
          options: { body: { planId, interval: yearly ? 'year' : 'month' } },
        }).response).body.json();

        if (res?.redirectUrl) {
          // ブラウザで遷移
          (window as any).location.assign(res.redirectUrl);
          return;
        } else {
          throw new Error('リダイレクトURLの取得に失敗しました。');
        }
      } else {
        // Mobile: IAPで購入し、レシートをサーバーへ検証
        // ここは実際の実装で react-native-iap を呼び出してください。
        // 例:
        // const purchase = await RNIap.requestSubscription(productId);
        // await post({ apiName:'myBedrockApi', path:'/iap/verify', options:{ body:{ receipt: purchase }}}).response;

        Alert.alert('ご案内', 'モバイルではストアのサブスクリプション画面からアップグレードしてください。');
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'アップグレード処理に失敗しました。');
    } finally {
      setLoadingPlan(null);
    }
  }, [yearly]);

  return (
    <View style={{ gap: 16 }}>
      {/* 月/年 切替 */}
      <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#f2f2f2' }}>
        <TouchableOpacity
          onPress={() => setYearly(false)}
          style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: yearly ? '#f2f2f2' : 'black' }}
        >
          <Text style={{ color: yearly ? '#111' : '#fff', fontWeight: '600' }}>月額</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setYearly(true)}
          style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: yearly ? 'black' : '#f2f2f2' }}
        >
          <Text style={{ color: yearly ? '#fff' : '#111', fontWeight: '600' }}>年額</Text>
        </TouchableOpacity>
      </View>

      {/* プランカード */}
      <View style={{ gap: 12 }}>
        {plans.map((p) => {
          const isCurrent = p.cta === '利用中';
          const isLoading = loadingPlan === p.id;

          return (
            <View
              key={p.id}
              style={{
                borderWidth: 1,
                borderColor: '#e6e6e6',
                borderRadius: 16,
                padding: 16,
                backgroundColor: p.elevated ? '#0b0b0b' : 'white',
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: p.elevated ? '#fff' : '#111' }}>{p.title}</Text>
              <Text style={{ marginTop: 8, fontSize: 22, fontWeight: '800', color: p.elevated ? '#fff' : '#111' }}>
                {p.price}
              </Text>
              {p.note && <Text style={{ color: '#bbb', marginTop: 4 }}>{p.note}</Text>}

              <View style={{ marginTop: 12, gap: 8 }}>
                {FEATURES.map((f) => {
                  const on = p.features[f.key];
                  return (
                    <View key={f.key} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Text style={{ color: on ? (p.elevated ? '#fff' : '#111') : '#999' }}>
                        {on ? '●' : '○'} {f.label}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={() => !isCurrent && !isLoading && onUpgrade(p.id)}
                disabled={isCurrent || isLoading}
                style={{
                  marginTop: 16,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: isCurrent ? '#cfcfcf' : (p.elevated ? '#fff' : '#111'),
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator />
                ) : (
                  <Text
                    style={{
                      textAlign: 'center',
                      fontWeight: '700',
                      color: isCurrent ? '#666' : (p.elevated ? '#111' : '#fff'),
                    }}
                  >
                    {p.cta}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* エラー表示 */}
      {errorMsg && (
        <View style={{ padding: 12, borderRadius: 8, backgroundColor: '#ffecec', borderWidth: 1, borderColor: '#ffc4c4' }}>
          <Text style={{ color: '#b00020' }}>{errorMsg}</Text>
        </View>
      )}

      {/* 免責等 */}
      <Text style={{ color: '#777', marginTop: 8, fontSize: 12 }}>
        * いつでもキャンセル可能。混雑時も Pro は優先実行されます。
      </Text>
    </View>
  );
}
