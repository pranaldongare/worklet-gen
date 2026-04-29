/* eslint-disable @typescript-eslint/no-namespace */

declare namespace google.picker {
  enum ViewId {
    DOCS = 'DOCS',
    DOCS_IMAGES = 'DOCS_IMAGES',
    DOCS_IMAGES_AND_VIDEOS = 'DOCS_IMAGES_AND_VIDEOS',
    DOCS_VIDEOS = 'DOCS_VIDEOS',
    DOCUMENTS = 'DOCUMENTS',
    FOLDERS = 'FOLDERS',
    FORMS = 'FORMS',
    PDFS = 'PDFS',
    PHOTOS = 'PHOTOS',
    PRESENTATIONS = 'PRESENTATIONS',
    RECENTLY_PICKED = 'RECENTLY_PICKED',
    SPREADSHEETS = 'SPREADSHEETS',
  }

  enum Action {
    CANCEL = 'cancel',
    PICKED = 'picked',
    LOADED = 'loaded',
  }

  enum Feature {
    MULTISELECT_ENABLED = 'MULTISELECT_ENABLED',
    NAV_HIDDEN = 'NAV_HIDDEN',
    SIMPLE_UPLOAD_ENABLED = 'SIMPLE_UPLOAD_ENABLED',
    SUPPORT_DRIVES = 'SUPPORT_DRIVES',
    MINE_ONLY = 'MINE_ONLY',
  }

  enum DocsViewMode {
    GRID = 'GRID',
    LIST = 'LIST',
  }

  interface DocumentObject {
    id: string;
    name: string;
    mimeType: string;
    url: string;
    sizeBytes?: number;
    lastEditedUtc?: number;
    [key: string]: unknown;
  }

  interface ResponseObject {
    action: Action;
    docs?: DocumentObject[];
  }

  class DocsView {
    constructor(viewId?: ViewId);
    setMimeTypes(mimeTypes: string): DocsView;
    setMode(mode: DocsViewMode): DocsView;
    setOwnedByMe(owned: boolean): DocsView;
    setParent(parentId: string): DocsView;
    setIncludeFolders(include: boolean): DocsView;
    setSelectFolderEnabled(enabled: boolean): DocsView;
    setQuery(query: string): DocsView;
  }

  class PickerBuilder {
    setDeveloperKey(key: string): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    addView(view: DocsView): PickerBuilder;
    setMaxItems(max: number): PickerBuilder;
    enableFeature(feature: Feature): PickerBuilder;
    disableFeature(feature: Feature): PickerBuilder;
    setTitle(title: string): PickerBuilder;
    setCallback(callback: (data: ResponseObject) => void): PickerBuilder;
    setOrigin(origin: string): PickerBuilder;
    setAppId(appId: string): PickerBuilder;
    build(): Picker;
  }

  class Picker {
    setVisible(visible: boolean): void;
    dispose(): void;
  }
}

declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    error?: string;
    error_description?: string;
    error_uri?: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message: string }) => void;
    prompt?: string;
    hint?: string;
  }

  interface TokenClient {
    requestAccessToken(overridableConfig?: {
      prompt?: string;
      hint?: string;
    }): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
}

declare namespace gapi {
  function load(apiName: string, callback: () => void): void;
}
