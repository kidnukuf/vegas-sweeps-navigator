/**
 * OperatorSetupGuide.tsx
 *
 * A standalone in-app onboarding guide for new operators (buyers) of the
 * B.O.B. Roll-off Passport app. Covers:
 *   1. Google Service Account setup (one-time)
 *   2. Creating your first event
 *   3. Importing bowler data from Google Sheets
 *   4. Distributing claim codes
 *   5. Day-of operations (doormen, QR scan, check-in)
 *
 * Accessible at /setup-guide — link from Event Settings sheet section and
 * the ED dashboard header.
 */

import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronRight, CheckCircle2, ExternalLink, ArrowLeft } from "lucide-react";

interface Step {
  id: string;
  number: number;
  title: string;
  badge: string;
  badgeColor: string;
  content: React.ReactNode;
}

function Callout({
  type,
  children,
}: {
  type: "tip" | "warning" | "info" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    tip:     "border-yellow-500/40 bg-yellow-500/5 text-yellow-200",
    warning: "border-red-500/40 bg-red-500/5 text-red-200",
    info:    "border-blue-500/40 bg-blue-500/5 text-blue-200",
    success: "border-green-500/40 bg-green-500/5 text-green-200",
  };
  const icons = { tip: "💡", warning: "⚠️", info: "ℹ️", success: "✅" };
  return (
    <div className={`rounded-lg border p-3 text-sm ${styles[type]}`}>
      <span className="mr-2">{icons[type]}</span>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-lg bg-black/60 border border-gray-700 p-3 text-xs text-green-300 font-mono overflow-x-auto whitespace-pre-wrap break-all">
      {children}
    </pre>
  );
}

function StepSection({ step, isOpen, onToggle }: { step: Step; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-gray-700/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex-none flex items-center justify-center w-9 h-9 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 font-bold text-sm">
          {step.number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-base">{step.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${step.badgeColor}`}>
              {step.badge}
            </span>
          </div>
        </div>
        <div className="flex-none text-gray-400">
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-6 pt-1 space-y-4 text-sm text-gray-300 border-t border-gray-700/50">
          {step.content}
        </div>
      )}
    </div>
  );
}

export default function OperatorSetupGuide() {
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set(["google-sa"]));

  const toggle = (id: string) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenSteps(new Set(steps.map((s) => s.id)));
  const collapseAll = () => setOpenSteps(new Set());

  const steps: Step[] = [
    {
      id: "google-sa",
      number: 1,
      title: "Create a Google Service Account",
      badge: "One-time setup",
      badgeColor: "border-yellow-500/40 text-yellow-300",
      content: (
        <>
          <p>
            The app writes Bowler IDs, QR codes, and scan timestamps directly back to your Google
            Sheet using a <strong className="text-white">Google Service Account</strong> — a special
            Google identity that your app uses to access sheets on your behalf. You only set this up
            once per deployment.
          </p>

          <div className="space-y-3">
            <p className="font-semibold text-white">Step-by-step:</p>

            <div className="space-y-2">
              <div className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <p>Go to{" "}
                    <a
                      href="https://console.cloud.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline inline-flex items-center gap-1"
                    >
                      Google Cloud Console <ExternalLink size={12} />
                    </a>
                    {" "}and sign in with your Google account.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <p>Create a new project (or select an existing one). Name it something like <code className="bg-black/40 px-1 rounded text-yellow-200">bob-rolloff-passport</code>.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <p>In the left menu go to <strong className="text-white">APIs &amp; Services → Library</strong>. Search for <strong className="text-white">Google Sheets API</strong> and click <strong className="text-white">Enable</strong>.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold flex items-center justify-center">4</span>
                <div>
                  <p>Go to <strong className="text-white">IAM &amp; Admin → Service Accounts</strong>. Click <strong className="text-white">Create Service Account</strong>.</p>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5 text-gray-400">
                    <li>Name: <code className="bg-black/40 px-1 rounded text-yellow-200">bob-sheets-writer</code></li>
                    <li>Description: "Writes bowler data to Google Sheets"</li>
                    <li>Skip the optional role and user access steps — click <strong className="text-white">Done</strong>.</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold flex items-center justify-center">5</span>
                <div>
                  <p>Click on the service account you just created. Go to the <strong className="text-white">Keys</strong> tab → <strong className="text-white">Add Key → Create new key</strong>. Choose <strong className="text-white">JSON</strong> and click <strong className="text-white">Create</strong>. A <code className="bg-black/40 px-1 rounded text-yellow-200">.json</code> file will download to your computer.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold flex items-center justify-center">6</span>
                <div>
                  <p>Open the downloaded JSON file in a text editor. It looks like this:</p>
                  <CodeBlock>{`{
  "type": "service_account",
  "project_id": "bob-rolloff-passport",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\\n...",
  "client_email": "bob-sheets-writer@bob-rolloff-passport.iam.gserviceaccount.com",
  ...
}`}</CodeBlock>
                  <p className="mt-2">Copy the <strong className="text-white">entire contents</strong> of this file.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold flex items-center justify-center">7</span>
                <div>
                  <p>In this app, go to <strong className="text-white">Settings → Secrets</strong> (in the Management UI). Find or create the secret named:</p>
                  <CodeBlock>GOOGLE_SERVICE_ACCOUNT_JSON</CodeBlock>
                  <p className="mt-1">Paste the entire JSON file contents as the value and save.</p>
                </div>
              </div>
            </div>
          </div>

          <Callout type="success">
            That's it for the one-time setup. The service account email (ending in <code className="bg-black/40 px-1 rounded">...iam.gserviceaccount.com</code>) is what you'll share your Google Sheets with in the next step.
          </Callout>
        </>
      ),
    },
    {
      id: "share-sheet",
      number: 2,
      title: "Share your Google Sheet with the service account",
      badge: "Per sheet",
      badgeColor: "border-blue-500/40 text-blue-300",
      content: (
        <>
          <p>
            For the app to read and write your sheet, you must share it with the service account's
            email address — just like sharing with a colleague.
          </p>

          <div className="space-y-2">
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">1</span>
              <p>Open your Google Sheet in a browser.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <p>Click the <strong className="text-white">Share</strong> button (top right).</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">3</span>
              <div>
                <p>In the "Add people and groups" field, paste your service account email. It looks like:</p>
                <CodeBlock>bob-sheets-writer@bob-rolloff-passport.iam.gserviceaccount.com</CodeBlock>
                <p className="mt-1">You can find this email in your downloaded JSON file under <code className="bg-black/40 px-1 rounded text-yellow-200">client_email</code>.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">4</span>
              <p>Set the permission to <strong className="text-white">Editor</strong> and click <strong className="text-white">Send</strong>.</p>
            </div>
          </div>

          <Callout type="tip">
            You need to share each new Google Sheet with the service account. Once shared, the app can read and write to it indefinitely — no re-sharing needed unless you create a new sheet file.
          </Callout>
        </>
      ),
    },
    {
      id: "create-event",
      number: 3,
      title: "Create your first event",
      badge: "Per event",
      badgeColor: "border-purple-500/40 text-purple-300",
      content: (
        <>
          <p>
            Each bowling event (tournament, league night, etc.) lives as a separate record in the
            app. All bowler data, QR codes, and scan history are scoped to the active event.
          </p>

          <div className="space-y-2">
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">1</span>
              <p>Log in to the <strong className="text-white">Event Director (ED)</strong> dashboard at <code className="bg-black/40 px-1 rounded text-yellow-200">/ed</code>.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">2</span>
              <p>Click <strong className="text-white">Events ▾ → Create New Event</strong>.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">3</span>
              <p>Fill in the event wizard: name, dates, banquet location, hotel check-in/out times, T-shirt details, and pool party info. These appear on bowler passports.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">4</span>
              <p>On the <strong className="text-white">Google Sheet</strong> step, you can leave it blank for now — the sheet link is set automatically when you import.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">5</span>
              <p>Click <strong className="text-white">Create Event</strong>. Then click <strong className="text-white">Set as Active</strong> to make it the current event bowlers see.</p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: "import",
      number: 4,
      title: "Import bowler data from Google Sheets",
      badge: "Per event",
      badgeColor: "border-purple-500/40 text-purple-300",
      content: (
        <>
          <p>
            The app reads your roster from a Google Sheet tab and generates a unique 10-digit
            Scantron ID and QR code for each bowler. This is the step that links your sheet to the
            event.
          </p>

          <div className="space-y-2">
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">1</span>
              <div>
                <p>In the ED dashboard, click <strong className="text-white">Import Data</strong>.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <p>Select <strong className="text-white">Google Sheets</strong> as the source. Paste the full URL of your sheet:</p>
                <CodeBlock>https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit</CodeBlock>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">3</span>
              <p>Select the correct tab name from the dropdown (or type it manually). Click <strong className="text-white">Import</strong>.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">4</span>
              <p>The app saves the sheet URL and tab to this event automatically. All future write-backs (Bowler IDs, QR codes, scan timestamps) go to this same sheet.</p>
            </div>
          </div>

          <Callout type="info">
            The sheet must follow the standard B.O.B. column layout (First Name in column I, Last Name in column J, Lane # in column E, etc.). Contact your reseller for the template if you don't have it.
          </Callout>

          <Callout type="tip">
            You can re-import at any time to pick up roster changes. Existing bowlers who already have Scantron IDs will not be overwritten — only new rows are added.
          </Callout>
        </>
      ),
    },
    {
      id: "claim-codes",
      number: 5,
      title: "Generate and distribute claim codes",
      badge: "Optional",
      badgeColor: "border-gray-500/40 text-gray-300",
      content: (
        <>
          <p>
            Claim codes are unique one-time codes (e.g. <code className="bg-black/40 px-1 rounded text-yellow-200">BOB-A1B2</code>) that you hand to each bowler. When enabled, bowlers must enter their code to complete sign-up — preventing anyone not on your roster from creating an account.
          </p>

          <div className="space-y-2">
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-gray-500/20 border border-gray-500/40 text-gray-300 text-xs font-bold flex items-center justify-center">1</span>
              <p>In the ED dashboard, click the <strong className="text-white">Claim Codes</strong> tab.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-gray-500/20 border border-gray-500/40 text-gray-300 text-xs font-bold flex items-center justify-center">2</span>
              <p>Click <strong className="text-white">Generate Codes</strong>. The app creates one unique code per bowler in the current event.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-gray-500/20 border border-gray-500/40 text-gray-300 text-xs font-bold flex items-center justify-center">3</span>
              <p>Click <strong className="text-white">Print Distribution Sheet</strong> to get a printable page with each bowler's name, lane, code, and QR code. Hand these out at registration.</p>
            </div>
            <div className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-gray-500/20 border border-gray-500/40 text-gray-300 text-xs font-bold flex items-center justify-center">4</span>
              <p>If a bowler loses their code, use <strong className="text-white">Lookup</strong> to find them by name or lane, then <strong className="text-white">Reissue</strong> to generate a new code (the old one is voided).</p>
            </div>
          </div>

          <Callout type="tip">
            Claim codes are optional. If you don't generate them, sign-up is open to anyone with the link. Enable them for tighter roster control at larger events.
          </Callout>
        </>
      ),
    },
    {
      id: "day-of",
      number: 6,
      title: "Day-of operations",
      badge: "Event day",
      badgeColor: "border-green-500/40 text-green-300",
      content: (
        <>
          <p>On event day, three roles use the app: the <strong className="text-white">Event Director</strong>, <strong className="text-white">Doormen</strong>, and <strong className="text-white">Bowlers</strong>.</p>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-white mb-1">Event Director</p>
              <ul className="ml-4 list-disc space-y-1 text-gray-300">
                <li>Monitor check-ins in real time from the <strong className="text-white">Roster</strong> tab.</li>
                <li>Use <strong className="text-white">Scan</strong> tab to manually scan a QR code if a doorman's device fails.</li>
                <li>Use <strong className="text-white">Unmatched</strong> tab to resolve bowlers whose QR scan didn't match a roster entry.</li>
                <li>Use <strong className="text-white">Audit</strong> tab to review all scan events with timestamps.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-white mb-1">Doormen</p>
              <ul className="ml-4 list-disc space-y-1 text-gray-300">
                <li>Open <code className="bg-black/40 px-1 rounded text-yellow-200">/doorman-tablet</code> on a tablet or phone.</li>
                <li>Enter the tablet PIN (set in Event Settings) to unlock.</li>
                <li>Tap <strong className="text-white">Scan QR</strong> to scan each bowler's passport QR code as they arrive.</li>
                <li>The screen shows green (admitted) or red (denied / already scanned) instantly.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-white mb-1">Bowlers</p>
              <ul className="ml-4 list-disc space-y-1 text-gray-300">
                <li>Sign up at <code className="bg-black/40 px-1 rounded text-yellow-200">/register</code> (or scan the QR on their printed code sheet).</li>
                <li>After sign-up, their QR code is emailed and accessible in their <strong className="text-white">Bowler Dashboard</strong>.</li>
                <li>They show the QR code to the doorman at the banquet entrance.</li>
              </ul>
            </div>
          </div>

          <Callout type="success">
            All scan events write back to your Google Sheet automatically — no manual data entry needed after the event.
          </Callout>
        </>
      ),
    },
    {
      id: "troubleshooting",
      number: 7,
      title: "Troubleshooting",
      badge: "Reference",
      badgeColor: "border-red-500/40 text-red-300",
      content: (
        <>
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-white">Sheet write-back isn't working</p>
              <ul className="ml-4 list-disc space-y-1 text-gray-400 mt-1">
                <li>Confirm <code className="bg-black/40 px-1 rounded text-yellow-200">GOOGLE_SERVICE_ACCOUNT_JSON</code> is set in Secrets and contains valid JSON.</li>
                <li>Confirm the Google Sheet is shared with the service account email as <strong className="text-white">Editor</strong>.</li>
                <li>Confirm the Google Sheets API is enabled in your Google Cloud project.</li>
                <li>Check that the event's linked sheet (visible in Event Settings → Sheet tab) matches the sheet you shared.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-white">Import fails with "Center not found"</p>
              <ul className="ml-4 list-disc space-y-1 text-gray-400 mt-1">
                <li>The bowling center name in your sheet must exactly match a center in the app's database.</li>
                <li>Contact your reseller to add missing bowling centers.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-white">Bowler can't sign up — "Invalid claim code"</p>
              <ul className="ml-4 list-disc space-y-1 text-gray-400 mt-1">
                <li>The code may have already been redeemed. Use the <strong className="text-white">Claim Codes → Lookup</strong> tab to check status.</li>
                <li>If redeemed by the wrong person, contact the ED to reissue.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-white">QR scan shows "already scanned"</p>
              <ul className="ml-4 list-disc space-y-1 text-gray-400 mt-1">
                <li>The bowler's token was already consumed at a previous door. Check the <strong className="text-white">Audit</strong> tab for the first scan timestamp and location.</li>
                <li>If it was a mistake, the ED can reset the scan status from the Roster tab.</li>
              </ul>
            </div>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/ed">
            <button className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
              <ArrowLeft size={16} />
              Back to ED
            </button>
          </Link>
          <div className="flex-1" />
          <span className="text-xs text-gray-500">Operator Setup Guide</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-yellow-500/30 bg-yellow-500/5 text-yellow-300 text-xs font-medium">
            <CheckCircle2 size={13} />
            B.O.B. Roll-off Passport
          </div>
          <h1 className="text-3xl font-bold text-white">Operator Setup Guide</h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            Everything you need to get your first event running — from Google Cloud setup to
            day-of door scanning. Follow these steps in order the first time.
          </p>
        </div>

        {/* Quick checklist */}
        <div className="rounded-xl border border-gray-700/50 bg-gray-900/40 p-5">
          <p className="font-semibold text-white mb-3">Quick checklist</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {[
              "Google Service Account created",
              "Sheets API enabled in Google Cloud",
              "Service account JSON added to Secrets",
              "Google Sheet shared with service account",
              "Event created and set as active",
              "Roster imported from Google Sheets",
              "Claim codes generated (optional)",
              "Doorman tablet PIN set",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-gray-400">
                <div className="w-4 h-4 rounded border border-gray-600 flex-none" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Expand/collapse controls */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">{steps.length} sections</p>
          <div className="flex gap-3 text-sm">
            <button onClick={expandAll} className="text-yellow-400 hover:text-yellow-300 transition-colors">
              Expand all
            </button>
            <span className="text-gray-600">·</span>
            <button onClick={collapseAll} className="text-gray-400 hover:text-white transition-colors">
              Collapse all
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step) => (
            <StepSection
              key={step.id}
              step={step}
              isOpen={openSteps.has(step.id)}
              onToggle={() => toggle(step.id)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="rounded-xl border border-gray-700/50 bg-gray-900/30 p-5 text-center space-y-2">
          <p className="text-sm text-gray-400">
            Need more help? Contact your reseller or the Vegas Sweeps Navigator support team.
          </p>
          <p className="text-xs text-gray-600">
            B.O.B. Roll-off Passport · Developed and operated by Vegas Sweeps Navigator
          </p>
        </div>
      </div>
    </div>
  );
}
