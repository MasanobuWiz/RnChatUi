export interface AppConfig {
  dataCollection: {
    enabled: boolean;
    bucket: string;
    region: string;
    tagPrefix: string;
  };
  bedrock: {
    region: string;
    model: string;
  };
  environment: 'development' | 'staging' | 'production';
}

export const getAppConfig = (): AppConfig => {
  const isDev = process.env.NODE_ENV === 'development';
  
  return {
    dataCollection: {
      enabled: process.env.REACT_APP_DATA_COLLECTION_ENABLED === 'true' || isDev,
      bucket: process.env.REACT_APP_DATA_COLLECTION_BUCKET || 'rnchatui-data-collection-dev',
      region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      tagPrefix: process.env.REACT_APP_DATA_TAG_PREFIX || 'chat-data'
    },
    bedrock: {
      region: process.env.REACT_APP_BEDROCK_REGION || 'us-east-1',
      model: process.env.REACT_APP_BEDROCK_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0'
    },
    environment: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development'
  };
};

export const validateConfig = (config: AppConfig): string[] => {
  const errors: string[] = [];

  if (config.dataCollection.enabled) {
    if (!config.dataCollection.bucket) {
      errors.push('Data collection bucket is required when data collection is enabled');
    }
    if (!config.dataCollection.region) {
      errors.push('AWS region is required for data collection');
    }
  }

  if (!config.bedrock.region) {
    errors.push('Bedrock region is required');
  }

  if (!config.bedrock.model) {
    errors.push('Bedrock model is required');
  }

  return errors;
};

export const appConfig = getAppConfig();