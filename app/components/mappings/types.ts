export type MappingData = {
  id: number;
  collectionName: string;
  discourseUrl: string;
  shopifyCollectionId: string;
  enabled: boolean;
  productCount: number;
  createdAt: Date;
  connectionSecret: string;
};

export type CollectionData = {
  id: string;
  title: string;
  alreadyMapped: boolean;
};

export type MappingAction = {
  error?: string;
  success?: boolean;
  message?: string;
  connectionSecret?: string;
};
