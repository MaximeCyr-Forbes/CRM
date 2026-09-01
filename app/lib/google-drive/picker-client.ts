"use client";

import type { CalendarBroker } from "../../data/calendar-types";
import { GOOGLE_DRIVE_FOLDER_MIME_TYPE } from "../../data/google-drive-types";

type PickerDocument = { id?: string };
type PickerResponse = { action?: string; docs?: PickerDocument[] };
type PickerDocsView = {
  setEnableDrives(enabled: boolean): PickerDocsView;
  setIncludeFolders(enabled: boolean): PickerDocsView;
  setMimeTypes(mimeTypes: string): PickerDocsView;
  setSelectFolderEnabled(enabled: boolean): PickerDocsView;
};
type PickerBuilder = {
  addView(view: PickerDocsView): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (data: PickerResponse) => void): PickerBuilder;
  setDeveloperKey(apiKey: string): PickerBuilder;
  setOAuthToken(accessToken: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};
type GooglePickerApi = {
  Action: { CANCEL: string; PICKED: string };
  DocsView: new (viewId: string) => PickerDocsView;
  PickerBuilder: new () => PickerBuilder;
  ViewId: { FOLDERS: string };
};

declare global {
  interface Window {
    gapi?: { load(name: string, options: { callback(): void; onerror(): void }): void };
    google?: { picker: GooglePickerApi };
  }
}

let pickerApiPromise: Promise<GooglePickerApi> | null = null;

function loadGooglePickerApi() {
  if (window.google?.picker) return Promise.resolve(window.google.picker);
  if (pickerApiPromise) return pickerApiPromise;
  pickerApiPromise = new Promise<GooglePickerApi>((resolve, reject) => {
    const loadPicker = () => {
      if (!window.gapi) return reject(new Error("Google Picker indisponible."));
      window.gapi.load("picker", {
        callback: () => window.google?.picker
          ? resolve(window.google.picker)
          : reject(new Error("Google Picker indisponible.")),
        onerror: () => reject(new Error("Google Picker indisponible.")),
      });
    };
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-picker="true"]');
    if (existingScript) {
      if (window.gapi) loadPicker();
      else existingScript.addEventListener("load", loadPicker, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.dataset.googlePicker = "true";
    script.src = "https://apis.google.com/js/api.js";
    script.addEventListener("load", loadPicker, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Picker indisponible.")), { once: true });
    document.head.append(script);
  }).catch((error) => {
    pickerApiPromise = null;
    throw error;
  });
  return pickerApiPromise;
}

export async function pickGoogleDriveFolder(
  broker: CalendarBroker,
  title = "Choisir un dossier partagé avec Forbes CRM",
) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY?.trim();
  const projectNumber = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER?.trim();
  if (!apiKey || !projectNumber) throw new Error("Google Picker n’est pas configuré.");

  const [picker, tokenResponse] = await Promise.all([
    loadGooglePickerApi(),
    fetch(`/api/google-drive/picker-token?broker=${broker}`, { cache: "no-store" }),
  ]);
  const tokenPayload = await tokenResponse.json().catch(() => null) as {
    accessToken?: string;
    error?: string;
  } | null;
  if (!tokenResponse.ok || !tokenPayload?.accessToken) {
    throw new Error(tokenPayload?.error ?? "Google Picker est temporairement indisponible.");
  }
  const accessToken = tokenPayload.accessToken;

  return new Promise<string | null>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setEnableDrives(true)
      .setMimeTypes(GOOGLE_DRIVE_FOLDER_MIME_TYPE);
    new picker.PickerBuilder()
      .setAppId(projectNumber)
      .setDeveloperKey(apiKey)
      .setOAuthToken(accessToken)
      .setOrigin(window.location.origin)
      .setTitle(title)
      .addView(view)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0]?.id ?? null);
        if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}
