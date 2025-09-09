// src/screens/ChatScreen/AuthModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  login,
  register,
  confirm,
  getIdToken,
  signInWithGoogle,
  signInWithAmazon,
  completeHostedUISignIn,
  getUserInfo,
} from '../../services/auth';

const CLOUDFRONT_URL = 'https://d20kh7meb2dq3y.cloudfront.net';
// S3にもローカルにも同じファイル名で設置してください
const googleIcon = { uri: `${CLOUDFRONT_URL}/assets/icon-google-24.png` };
const amazonIcon = { uri: `${CLOUDFRONT_URL}/assets/icon-amazon-24.png` };

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
  initialMode?: 'signin' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onClose,
  onAuthSuccess,
  initialMode = 'signin',
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'confirm'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'amazon' | null>(null);

  useEffect(() => {
    console.log('[AuthModal] CloudFront image-buttons build is active');
    console.log('[AuthModal] CloudFront URL:', CLOUDFRONT_URL);
  }, []);

  useEffect(() => {
    const checkOAuthCallback = async () => {
      if (!visible) return;
      try {
        if (typeof window !== 'undefined') {
          const hasOAuthParams =
            window.location.search.includes('code=') ||
            window.location.search.includes('error=');
          if (hasOAuthParams) {
            await completeHostedUISignIn();
            const idToken = await getIdToken();
            if (idToken) {
              const userInfo = await getUserInfo();
              const user = {
                username: userInfo?.email?.split('@')[0] || 'user',
                email: userInfo?.email,
                idToken,
                sub: userInfo?.sub,
              };
              onAuthSuccess(user);
              handleClose();
            }
          }
        }
      } catch (e) {
        console.warn('OAuth callback error:', (e as any)?.message || e);
      }
    };
    checkOAuthCallback();
  }, [visible]);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      const idToken = await getIdToken();
      if (idToken) {
        onAuthSuccess({ username: email.split('@')[0], email, idToken });
        handleClose();
      } else {
        Alert.alert('エラー', 'トークン取得に失敗しました');
      }
    } catch (error: any) {
      Alert.alert('サインインエラー', error.message || 'サインインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
      setMode('confirm');
      Alert.alert('確認', '確認コードがメールに送信されました');
    } catch (error: any) {
      Alert.alert('サインアップエラー', error.message || 'サインアップに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!email || !confirmCode) {
      Alert.alert('エラー', 'メールアドレスと確認コードを入力してください');
      return;
    }
    setLoading(true);
    try {
      await confirm(email, confirmCode);
      setMode('signin');
      Alert.alert('成功', 'アカウントが確認されました。サインインしてください。');
    } catch (error: any) {
      Alert.alert('確認エラー', error.message || '確認に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'amazon') => {
    setSocialLoading(provider);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithAmazon();
      }
    } catch (error: any) {
      setSocialLoading(null);
      Alert.alert('ソーシャルログインエラー', error.message || 'ログインに失敗しました');
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmCode('');
    setLoading(false);
    setSocialLoading(null);
  };

  const handleClose = () => {
    resetForm();
    setMode(initialMode);
    onClose();
  };

  const getTitle = () => {
    if (mode === 'signup') return 'Create your account';
    if (mode === 'confirm') return 'Confirm your account';
    return 'Sign in to your account';
  };

  const getSubmitHandler = () => {
    if (mode === 'signup') return handleSignUp;
    if (mode === 'confirm') return handleConfirm;
    return handleSignIn;
  };

  const getSubmitText = () => {
    if (mode === 'signup') return 'Sign up';
    if (mode === 'confirm') return 'Confirm';
    return 'Sign in';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.splitContainer}>
            <View style={styles.formSection}>
              <ScrollView
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.header}>
                  <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.headerText}>
                    You are signing into <Text style={styles.brandText}>🤖 RnChatUI</Text>
                  </Text>
                </View>
                <Text style={styles.title}>{getTitle()}</Text>

                {mode !== 'confirm' && (
                  <View style={styles.socialSection}>
                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin('google')}
                      disabled={loading || socialLoading !== null}
                    >
                      <Image
                        source={googleIcon}
                        style={styles.socialIcon}
                        resizeMode="contain"
                      />
                      <Text style={styles.socialButtonText}>Sign in with Google</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin('amazon')}
                      disabled={loading || socialLoading !== null}
                    >
                      <Image
                        source={amazonIcon}
                        style={styles.socialIcon}
                        resizeMode="contain"
                      />
                      <Text style={styles.socialButtonText}>Sign in with Amazon</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {mode !== 'confirm' && (
                  <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                  </View>
                )}
                <View style={styles.inputSection}>
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                  {mode !== 'confirm' && (
                    <TextInput
                      style={styles.input}
                      placeholder="Password"
                      placeholderTextColor="#9CA3AF"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    />
                  )}
                  {mode === 'confirm' && (
                    <TextInput
                      style={styles.input}
                      placeholder="Confirmation code"
                      placeholderTextColor="#9CA3AF"
                      value={confirmCode}
                      onChangeText={setConfirmCode}
                      keyboardType="numeric"
                    />
                  )}
                  <TouchableOpacity
                    style={[
                      styles.authButton,
                      (loading || socialLoading !== null) && styles.disabledButton,
                    ]}
                    onPress={getSubmitHandler()}
                    disabled={loading || socialLoading !== null}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.authButtonText}>{getSubmitText()}</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {mode !== 'confirm' && (
                  <Text style={styles.termsText}>
                    By continuing, you agree to xAI's{' '}
                    <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
                    <Text style={styles.termsLink}>Privacy Policy</Text>.
                  </Text>
                )}
                {mode !== 'confirm' && (
                  <View style={styles.switchModeContainer}>
                    <Text style={styles.switchModeText}>
                      {mode === 'signin'
                        ? "Don't have an account? "
                        : 'Already have an account? '}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                    >
                      <Text style={styles.switchModeLink}>
                        {mode === 'signin' ? 'Sign up' : 'Sign in'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
            <View style={styles.imageSection}>
              <View style={styles.gradientOverlay}>
                <View style={styles.decorativeElements}>
                  <View style={[styles.decorativeElement, styles.decorativeElement1]} />
                  <View style={[styles.decorativeElement, styles.decorativeElement2]} />
                  <View style={[styles.decorativeElement, styles.decorativeElement3]} />
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'row'
  },
  formSection: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  formContent: {
    flexGrow: 1,
    paddingHorizontal: 40,
    paddingVertical: 32,
    justifyContent: 'center',
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%',
  },
  imageSection: {
    flex: 1,
    backgroundColor: '#000000'
  },
  gradientOverlay: {
    flex: 1,
    backgroundColor: '#0f172a',
    position: 'relative',
    overflow: 'hidden',
  },
  decorativeElements: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  decorativeElement: {
    position: 'absolute',
    borderRadius: 200,
    opacity: 0.1,
  },
  decorativeElement1: {
    width: 400,
    height: 400,
    backgroundColor: '#3b82f6',
    top: '20%',
    left: '10%',
  },
  decorativeElement2: {
    width: 300,
    height: 300,
    backgroundColor: '#8b5cf6',
    bottom: '25%',
    right: '15%',
  },
  decorativeElement3: {
    width: 200,
    height: 200,
    backgroundColor: '#06b6d4',
    top: '60%',
    left: '25%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    position: 'relative'
  },
  closeButton: {
    position: 'absolute',
    left: -16,
    top: -8,
    padding: 12,
    zIndex: 1
  },
  closeButtonText: {
    fontSize: 20,
    color: '#6B7280',
    fontWeight: '400'
  },
  headerText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    letterSpacing: 0.3
  },
  brandText: {
    fontWeight: '600',
    color: '#111827'
  },
  title: {
    fontSize: 32,
    fontWeight: '300',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 40,
    letterSpacing: -0.5,
  },
  socialSection: {
    marginBottom: 24,
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    height: 48,
  },
  socialIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  socialButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '500',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '400',
  },
  inputSection: {
    marginBottom: 32,
    gap: 16
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  authButton: {
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    height: 48,
    justifyContent: 'center',
  },
  authButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600'
  },
  disabledButton: {
    opacity: 0.6
  },
  termsText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  termsLink: {
    color: '#111827',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  switchModeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  switchModeText: {
    fontSize: 14,
    color: '#6B7280'
  },
  switchModeLink: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
