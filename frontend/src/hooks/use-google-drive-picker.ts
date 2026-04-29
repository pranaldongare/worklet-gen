import { useState, useRef, useCallback, useEffect } from 'react';

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  md: 'text/markdown',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
};

const GOOGLE_EXPORT_MAP: Record<string, { mimeType: string; ext: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: '.docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: '.pptx',
  },
};

interface UseGoogleDrivePickerOptions {
  clientId: string;
  apiKey: string;
  allowedExtensions?: string[];
  maxFiles?: number;
}

interface UseGoogleDrivePickerReturn {
  openPicker: () => Promise<File[]>;
  isLoading: boolean;
  error: string | null;
}

function loadScript(src: string, onLoad: () => void) {
  if (document.querySelector(`script[src="${src}"]`)) {
    onLoad();
    return;
  }
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.defer = true;
  script.onload = onLoad;
  document.head.appendChild(script);
}

export function useGoogleDrivePicker(
  options: UseGoogleDrivePickerOptions,
): UseGoogleDrivePickerReturn {
  const { clientId, apiKey, allowedExtensions, maxFiles = 10 } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gapiLoadedRef = useRef(false);
  const gisLoadedRef = useRef(false);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    loadScript('https://apis.google.com/js/api.js', () => {
      window.gapi.load('picker', () => {
        gapiLoadedRef.current = true;
      });
    });
    loadScript('https://accounts.google.com/gsi/client', () => {
      gisLoadedRef.current = true;
    });
  }, []);

  const getAccessToken = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (accessTokenRef.current) {
        resolve(accessTokenRef.current);
        return;
      }

      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            reject(new Error(tokenResponse.error_description || 'OAuth failed'));
            return;
          }
          accessTokenRef.current = tokenResponse.access_token;
          resolve(tokenResponse.access_token);
        },
        error_callback: (err) => {
          reject(new Error(err.message || 'Google sign-in was cancelled'));
        },
      });

      tokenClient.requestAccessToken();
    });
  }, [clientId]);

  const showPicker = useCallback(
    (token: string): Promise<google.picker.ResponseObject> => {
      return new Promise((resolve) => {
        const mimeTypes = allowedExtensions
          ? allowedExtensions.map((ext) => EXTENSION_TO_MIME[ext]).filter(Boolean)
          : Object.values(EXTENSION_TO_MIME);

        const googleWorkspaceMimes = Object.keys(GOOGLE_EXPORT_MAP);
        const allMimes = [...new Set([...mimeTypes, ...googleWorkspaceMimes])];

        const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setMimeTypes(allMimes.join(','))
          .setMode(google.picker.DocsViewMode.LIST);

        const picker = new google.picker.PickerBuilder()
          .setDeveloperKey(apiKey)
          .setOAuthToken(token)
          .addView(view)
          .setMaxItems(maxFiles)
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
          .setTitle('Select files from Google Drive')
          .setCallback((data) => {
            if (
              data.action === google.picker.Action.PICKED ||
              data.action === google.picker.Action.CANCEL
            ) {
              resolve(data);
            }
          })
          .build();

        picker.setVisible(true);
      });
    },
    [apiKey, allowedExtensions, maxFiles],
  );

  const downloadFile = useCallback(
    async (
      fileDoc: { id: string; name: string; mimeType: string },
      token: string,
    ): Promise<File> => {
      const exportInfo = GOOGLE_EXPORT_MAP[fileDoc.mimeType];
      let url: string;
      let fileName = fileDoc.name;
      let contentType: string;

      if (exportInfo) {
        url = `https://www.googleapis.com/drive/v3/files/${fileDoc.id}/export?mimeType=${encodeURIComponent(exportInfo.mimeType)}`;
        contentType = exportInfo.mimeType;
        if (!fileName.endsWith(exportInfo.ext)) {
          fileName += exportInfo.ext;
        }
      } else {
        url = `https://www.googleapis.com/drive/v3/files/${fileDoc.id}?alt=media`;
        contentType = fileDoc.mimeType;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to download "${fileName}" (HTTP ${response.status})`,
        );
      }

      const blob = await response.blob();
      return new File([blob], fileName, { type: contentType });
    },
    [],
  );

  const openPicker = useCallback(async (): Promise<File[]> => {
    setError(null);

    if (!gapiLoadedRef.current || !gisLoadedRef.current) {
      setError('Google APIs are still loading. Please try again.');
      return [];
    }

    try {
      const token = await getAccessToken();
      const pickerResult = await showPicker(token);

      if (pickerResult.action === google.picker.Action.CANCEL) {
        return [];
      }

      const docs = pickerResult.docs || [];
      if (docs.length === 0) return [];

      setIsLoading(true);

      const results = await Promise.allSettled(
        docs.map((doc) =>
          downloadFile(
            { id: doc.id, name: doc.name, mimeType: doc.mimeType },
            token,
          ),
        ),
      );

      const succeeded = results
        .filter(
          (r): r is PromiseFulfilledResult<File> => r.status === 'fulfilled',
        )
        .map((r) => r.value);

      const failedCount = results.filter(
        (r) => r.status === 'rejected',
      ).length;

      if (failedCount > 0) {
        setError(`${failedCount} file(s) could not be downloaded from Drive`);
      }

      return succeeded;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google Drive picker failed';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, showPicker, downloadFile]);

  return { openPicker, isLoading, error };
}
