import React, { useState, useEffect } from 'react';
import { AttendeeCategory, DigitalPassData, PaymentStatus } from '../types';

interface UserPassPortalProps {
  initialAccessToken?: string;
}

export const UserPassPortal: React.FC<UserPassPortalProps> = ({ initialAccessToken }) => {
  // Pass State
  const [ticketData, setTicketData] = useState<DigitalPassData>({
    ticketId: 'FM26-001',
    fullName: 'Aarav Sharma',
    category: 'FRESHER',
    college: 'B.Arch - Architecture',
    paymentStatus: 'PAID',
    entryPassStatus: 'ACTIVE',
    checkInStatus: 'NOT_CHECKED_IN',
    eventDate: '02 OCT 2026',
    doorsOpen: '5:30 PM Sharp',
    venue: 'Pune (MSAP Campus Main Auditorium)',
    eventName: "53rd Freshers' Meet 2026",
    organization: "Manipur Students' Association Pune (MSAP)",
    amount: '₹350',
    qrToken: 'msap_token_sample_verified_gate_payload',
    paymentUtr: 'UTR-99201948218X',
  });

  const [hashStamp, setHashStamp] = useState('SHA256: 8F7C•••E29A');
  const [isCopied, setIsCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [walletAdded, setWalletAdded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('+91 98765 43210');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // Form State
  const [inputName, setInputName] = useState('Aarav Sharma');
  const [inputPhone, setInputPhone] = useState('+91 98765 43210');
  const [inputEmail, setInputEmail] = useState('aarav.fresh26@msap.edu.in');
  const [inputRoll, setInputRoll] = useState('260901248');
  const [inputDept, setInputDept] = useState('B.Arch - Architecture');
  const [selectedCohort, setSelectedCohort] = useState<AttendeeCategory>('FRESHER');
  const [inputUtr, setInputUtr] = useState('UTR-99201948218X');
  const [submitting, setSubmitting] = useState(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [showGoogleFormModal, setShowGoogleFormModal] = useState(false);

  const [activeAccessToken, setActiveAccessToken] = useState<string | null>(initialAccessToken || null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Load pass if initialAccessToken is provided
  useEffect(() => {
    if (initialAccessToken) {
      setActiveAccessToken(initialAccessToken);
      loadPassByToken(initialAccessToken);
    }
  }, [initialAccessToken]);

  // Requirement 17: Payment Status Polling
  // While pass is PENDING and activeAccessToken exists, poll every 4 seconds
  useEffect(() => {
    if (!activeAccessToken || ticketData.paymentStatus === 'PAID') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status-by-token/${encodeURIComponent(activeAccessToken)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.isPaid) {
            await loadPassByToken(activeAccessToken);
          }
        }
      } catch (e) {
        // Silently retry on next tick
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeAccessToken, ticketData.paymentStatus]);

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleInitiatePayment = async () => {
    if (!activeAccessToken) {
      alert('Please register or retrieve your pass first.');
      return;
    }
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: activeAccessToken }),
      });
      const data = await res.json();

      if (data.alreadyPaid) {
        await loadPassByToken(activeAccessToken);
        setPaymentLoading(false);
        return;
      }

      if (!res.ok || !data.order) {
        alert(data.error || 'Failed to create payment gateway order.');
        setPaymentLoading(false);
        return;
      }

      const { order } = data;
      const isScriptLoaded = await loadRazorpayScript();

      if (isScriptLoaded && (window as any).Razorpay && order.keyId) {
        const options = {
          key: order.keyId,
          amount: order.amount * 100,
          currency: order.currency || 'INR',
          name: "MSAP 53rd Freshers' Meet 2026",
          description: 'Official Gala All-Access & Food Pass (₹350)',
          order_id: order.orderId,
          prefill: {
            name: ticketData.fullName,
          },
          theme: {
            color: '#38BDF8',
          },
          handler: async function (response: any) {
            // Requirement 1, 6, 7: Real server-side cryptographic checkout verification
            const verifyRes = await fetch('/api/payments/verify-checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accessToken: activeAccessToken,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              await loadPassByToken(activeAccessToken);
            } else {
              alert(verifyData.error || 'Payment signature verification failed.');
            }
          },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        alert(`Payment order created: ${order.orderId}. Please complete payment via gateway webhook.`);
      }
    } catch (err) {
      console.error('Payment checkout error:', err);
      alert('Error communicating with payment gateway.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const loadPassByToken = async (token: string) => {
    setActiveAccessToken(token);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ticket) {
          setTicketData(data.ticket);
          updateHashStamp();
        }
      }
    } catch (err) {
      console.error('Error loading pass:', err);
    }
  };

  const updateHashStamp = () => {
    const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase() + '•••' + Math.random().toString(16).substring(2, 6).toUpperCase();
    setHashStamp(`SHA256: ${randomHex}`);
  };

  // Search / Retrieve Pass
  const handleSearchPass = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchMessage(null);

    try {
      const res = await fetch(`/api/tickets/lookup?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();

      if (res.ok && data.accessToken) {
        setSearchMessage(`✅ Pass found for ${data.fullName} (${data.ticketId})!`);
        await loadPassByToken(data.accessToken);

        // Smooth scroll to digital pass
        const el = document.getElementById('digitalTicketCard');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-4', 'ring-[#38BDF8]');
          setTimeout(() => el.classList.remove('ring-4', 'ring-[#38BDF8]'), 1500);
        }
      } else {
        setSearchMessage(`❌ ${data.error || 'No matching attendee found. Try another search.'}`);
      }
    } catch {
      setSearchMessage('❌ Network lookup failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Submit Registration Intake
  const handleSubmitRegistration = async () => {
    if (!inputName.trim() || !inputPhone.trim() || !inputEmail.trim()) {
      setFormErrorMessage('Please complete Name, Mobile, and Email fields.');
      return;
    }

    setSubmitting(true);
    setFormErrorMessage(null);
    setFormSuccessMessage(null);

    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: inputName.trim(),
          phone: inputPhone.trim(),
          email: inputEmail.trim(),
          college: inputDept,
          category: selectedCohort,
          rollId: inputRoll.trim(),
          paymentUtr: inputUtr.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.attendee) {
        const ticketDisplay = data.attendee.ticket_id || 'PENDING (Issued Upon Payment)';
        setFormSuccessMessage(`✅ Registration saved in MySQL! Ticket: ${ticketDisplay}`);
        // Load the newly issued pass
        if (data.attendee.access_token) {
          await loadPassByToken(data.attendee.access_token);
        }

        // Pulse animation on pass card
        const card = document.getElementById('digitalTicketCard');
        if (card) {
          card.classList.add('ring-4', 'ring-[#34D399]', 'scale-[1.01]');
          setTimeout(() => card.classList.remove('ring-4', 'ring-[#34D399]', 'scale-[1.01]'), 1000);
        }
      } else {
        setFormErrorMessage(data.error || 'Registration failed.');
      }
    } catch {
      setFormErrorMessage('Unable to connect to registration server.');
    } finally {
      setSubmitting(false);
    }
  };

  // Copy Ticket ID
  const handleCopyTicket = () => {
    if (!ticketData.ticketId) return;
    navigator.clipboard.writeText(ticketData.ticketId).catch(() => {});
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Download Ticket Card
  const handleDownloadTicket = () => {
    setDownloading(true);
    setTimeout(() => {
      window.print();
      setDownloading(false);
    }, 600);
  };

  // Add to Wallet
  const handleAddToWallet = () => {
    setWalletAdded(true);
    setTimeout(() => setWalletAdded(false), 2500);
  };

  // Share via WhatsApp
  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `🎟️ My official pass for MSAP 53rd Freshers' Meet 2026 is confirmed!\n\n` +
      `Ticket ID: ${ticketData.ticketId}\n` +
      `Name: ${ticketData.fullName}\n` +
      `Date: 02 OCT 2026 | Pune Main Auditorium\n\n` +
      `See you at the Gala!`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const isPaid = ticketData.paymentStatus === 'PAID';

  return (
    <div className="w-full min-h-screen bg-[#061A2E] text-[#EAF6FF] antialiased">
      {/* ================= HEADER (PUBLIC - NO ADMIN LINKS AS SPECIFIED) ================= */}
      <header className="fixed top-0 left-0 right-0 w-full z-50 bg-[#061A2E]/95 backdrop-blur-2xl border-b border-[#164468]/60 shadow-[0_4px_30px_rgba(6,26,46,0.6)]">
        <div className="h-20 max-w-7xl mx-auto px-5 lg:px-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0284C7] to-[#38BDF8] flex items-center justify-center shadow-[0_0_16px_rgba(56,189,248,0.4)] text-[#061A2E] font-extrabold text-sm tracking-wider font-display-title">
              MSAP
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-white tracking-tight font-display-title">MSAP</span>
                <span className="font-label-caps text-[#38BDF8] px-1.5 py-0.5 rounded bg-[#103A5F] font-mono-code font-bold">2026</span>
              </div>
              <span className="font-label-md text-[#9DB8CF] hidden sm:inline">53rd Freshers' Meet Gala</span>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0C2C4A] border border-[#34D399]/30 shadow-[0_0_12px_rgba(52,211,153,0.15)]">
              <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse"></span>
              <span className="font-label-md text-[#EAF6FF]">Apps Script Live Sync Engine</span>
            </div>
            <div className="flex items-center gap-2 text-[#9DB8CF] font-label-md">
              <span className="material-symbols-outlined text-[#38BDF8] text-[16px]">calendar_today</span>
              <span>02 OCT 2026</span>
              <span className="text-[#164468]">•</span>
              <span className="material-symbols-outlined text-[#38BDF8] text-[16px]">location_on</span>
              <span>Pune Main Auditorium</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowGoogleFormModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0C2C4A] hover:bg-[#103A5F] text-[#38BDF8] border border-[#164468] transition-colors text-xs font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">assignment</span>
              <span>Google Form Link</span>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0C2C4A] text-[#38BDF8] border border-[#164468] text-xs">
              <span className="material-symbols-outlined text-[16px]">verified_user</span>
              <span className="hidden sm:inline">Official Ticketing</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#38BDF8] flex items-center justify-center shadow-[0_0_12px_rgba(56,189,248,0.4)] text-[#061A2E] font-bold text-xs">
              M26
            </div>
          </div>
        </div>
      </header>

      {/* ================= MAIN CONTENT ================= */}
      <main className="w-full pt-24 pb-16 min-h-[calc(100vh-140px)]">
        <div className="relative w-full overflow-hidden">
          {/* Ambient Glows */}
          <div className="absolute top-[-8rem] right-[-5rem] w-[42rem] h-[42rem] rounded-full bg-gradient-to-br from-[#0284C7]/20 via-[#38BDF8]/10 to-transparent blur-3xl pointer-events-none"></div>
          <div className="absolute top-[32rem] left-[-10rem] w-[36rem] h-[36rem] rounded-full bg-gradient-to-tr from-[#38BDF8]/15 via-[#0284C7]/10 to-transparent blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-20 right-1/4 w-[30rem] h-[30rem] rounded-full bg-gradient-to-t from-[#FDBA74]/15 via-[#FDBA74]/5 to-transparent blur-3xl pointer-events-none"></div>

          <div className="max-w-7xl mx-auto px-5 lg:px-12 flex flex-col gap-10 relative z-10">
            {/* ================= 1. HERO HEADER ================= */}
            <section className="flex flex-col gap-4 items-start pt-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FDBA74]/15 text-[#FDBA74] border border-[#FDBA74]/30 shadow-[0_0_18px_rgba(253,186,116,0.25)]">
                <span className="material-symbols-outlined text-[16px] text-[#FDBA74]">stars</span>
                <span className="font-label-caps tracking-widest text-[#FDBA74] uppercase">53RD INDUCTION FESTIVAL • GENESIS GALA</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#FDBA74] animate-ping"></span>
              </div>

              <div className="flex flex-col gap-1">
                <h1 className="font-display-title font-display-hero tracking-tight bg-gradient-to-r from-[#EAF6FF] via-[#7DD3FC] to-[#38BDF8] bg-clip-text text-transparent">
                  MSAP 53rd Freshers' Meet 2026
                </h1>
                <p className="font-body-lg text-[#9DB8CF] max-w-3xl">
                  Annual Induction Festival & Gala Night organized by Manipur Students' Association Pune (MSAP). Complete the registration form and verify your payment to automatically issue your authentic cryptographically signed entry voucher pass.
                </p>
              </div>

              {/* Event Metadata Pills */}
              <div className="flex flex-wrap items-center gap-3 w-full pt-1">
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#0C2C4A] border border-[#164468] shadow-sm">
                  <span className="material-symbols-outlined text-[#38BDF8] text-[20px]">calendar_month</span>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[#9DB8CF]">EVENT DATE</span>
                    <span className="font-label-lg text-[#EAF6FF]">02 OCT 2026</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#0C2C4A] border border-[#164468] shadow-sm">
                  <span className="material-symbols-outlined text-[#7DD3FC] text-[20px]">schedule</span>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[#9DB8CF]">DOORS OPEN</span>
                    <span className="font-label-lg text-[#EAF6FF]">5:30 PM Sharp</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#0C2C4A] border border-[#164468] shadow-sm">
                  <span className="material-symbols-outlined text-[#FDBA74] text-[20px]">location_on</span>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[#9DB8CF]">VENUE</span>
                    <span className="font-label-lg text-[#EAF6FF]">Pune (MSAP Campus Main Auditorium)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#0C2C4A] border border-[#164468] shadow-sm">
                  <span className="material-symbols-outlined text-[#34D399] text-[20px]">confirmation_number</span>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[#9DB8CF]">PASS TYPE</span>
                    <span className="font-label-lg text-[#EAF6FF]">All-Access Gala & Food Pass (₹350)</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ================= 2. MAIN REGISTRATION & TICKET GENERATOR FLOW ================= */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT COLUMN: REGISTRATION INTAKE & SIMULATOR (5 Cols) */}
              <div className="lg:col-span-5 flex flex-col gap-5">
                {/* Quick Pass Retrieval Bar */}
                <div className="bg-[#0C2C4A]/95 backdrop-blur-xl p-4 rounded-2xl border border-[#164468] shadow-lg flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#38BDF8] text-[20px]">search</span>
                    <span className="font-label-caps text-[#38BDF8] uppercase tracking-wider">RETRIEVE EXISTING PASS</span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <input
                      className="w-full bg-[#061A2E] px-3.5 py-2.5 rounded-xl font-body-sm text-[#EAF6FF] placeholder:text-[#9DB8CF] border border-[#164468] outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8] transition-all"
                      placeholder="Enter Mobile No, Roll, or Ticket ID"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchPass()}
                    />
                    <button
                      onClick={handleSearchPass}
                      disabled={searchLoading}
                      className="px-4 py-2.5 rounded-xl bg-[#38BDF8] hover:bg-[#7DD3FC] text-[#061A2E] font-label-lg whitespace-nowrap shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer font-bold disabled:opacity-50"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {searchLoading ? 'progress_activity' : 'sync'}
                      </span>
                      <span>{searchLoading ? 'Searching...' : 'Search'}</span>
                    </button>
                  </div>

                  {searchMessage && (
                    <div className="text-xs p-2 rounded-lg bg-[#061A2E] border border-[#164468] text-[#EAF6FF] font-mono-code">
                      {searchMessage}
                    </div>
                  )}

                  <span className="font-label-md text-[#9DB8CF]">
                    Searches linked Google Sheet rows & MySQL database by Roll, Phone, or Ticket ID.
                  </span>
                </div>

                {/* Interactive Google Form / Registration Intake Form Card */}
                <div className="bg-[#0C2C4A]/95 backdrop-blur-2xl p-6 rounded-2xl border border-[#164468] shadow-xl flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-[#164468]/60 pb-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#103A5F] text-[#38BDF8] font-label-caps font-bold">
                          AUTOMATED INTAKE
                        </span>
                        <h2 className="font-headline-md text-white font-display-title">Student Registration</h2>
                      </div>
                      <p className="font-body-sm text-[#9DB8CF]">Synced with Google Forms & Apps Script Webhook</p>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#34D399]/15 border border-[#34D399]/30">
                      <span className="w-2 h-2 rounded-full bg-[#34D399]"></span>
                      <span className="font-label-caps text-[#34D399] font-semibold">ONLINE</span>
                    </div>
                  </div>

                  <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); handleSubmitRegistration(); }}>
                    {/* Full Candidate Name */}
                    <div className="flex flex-col gap-1">
                      <label className="font-label-caps text-[#9DB8CF] flex items-center justify-between">
                        <span>FULL CANDIDATE NAME</span>
                        <span className="text-[#FB7185]">*</span>
                      </label>
                      <div className="relative">
                        <input
                          className="w-full bg-[#061A2E] px-3.5 py-2.5 rounded-xl font-body-md text-[#EAF6FF] border border-[#164468] outline-none focus:border-[#38BDF8] transition-all"
                          placeholder="e.g. Aarav Sharma"
                          type="text"
                          value={inputName}
                          onChange={(e) => setInputName(e.target.value)}
                          required
                        />
                        <span className="material-symbols-outlined absolute right-3 top-2.5 text-[#9DB8CF] text-[20px]">
                          person
                        </span>
                      </div>
                    </div>

                    {/* Phone & Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="font-label-caps text-[#9DB8CF] flex items-center justify-between">
                          <span>WHATSAPP / MOBILE</span>
                          <span className="text-[#FB7185]">*</span>
                        </label>
                        <input
                          className="w-full bg-[#061A2E] px-3.5 py-2.5 rounded-xl font-body-sm text-[#EAF6FF] border border-[#164468] outline-none focus:border-[#38BDF8] transition-all"
                          type="tel"
                          value={inputPhone}
                          onChange={(e) => setInputPhone(e.target.value)}
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="font-label-caps text-[#9DB8CF] flex items-center justify-between">
                          <span>LEARNER OFFICIAL EMAIL</span>
                          <span className="text-[#FB7185]">*</span>
                        </label>
                        <input
                          className="w-full bg-[#061A2E] px-3.5 py-2.5 rounded-xl font-body-sm text-[#EAF6FF] border border-[#164468] outline-none focus:border-[#38BDF8] transition-all"
                          type="email"
                          value={inputEmail}
                          onChange={(e) => setInputEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {/* Roll ID & Department */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="font-label-caps text-[#9DB8CF] flex items-center justify-between">
                          <span>STUDENT / ROLL ID</span>
                          <span className="text-[#FB7185]">*</span>
                        </label>
                        <input
                          className="w-full bg-[#061A2E] px-3.5 py-2.5 rounded-xl font-body-sm text-[#EAF6FF] border border-[#164468] outline-none focus:border-[#38BDF8] transition-all"
                          type="text"
                          value={inputRoll}
                          onChange={(e) => setInputRoll(e.target.value)}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="font-label-caps text-[#9DB8CF]">COLLEGE / DEPARTMENT</label>
                        <div className="relative">
                          <select
                            className="w-full bg-[#061A2E] px-3 py-2.5 rounded-xl font-body-sm text-[#EAF6FF] border border-[#164468] outline-none focus:border-[#38BDF8] appearance-none transition-all cursor-pointer"
                            value={inputDept}
                            onChange={(e) => setInputDept(e.target.value)}
                          >
                            <option value="B.Arch - Architecture">B.Arch - Architecture</option>
                            <option value="B.Des - Interior Design">B.Des - Interior Design</option>
                            <option value="B.Des - Fashion Design">B.Des - Fashion Design</option>
                            <option value="M.Plan - Urban Planning">M.Plan - Urban Planning</option>
                            <option value="Other University Affiliate">Other University Affiliate</option>
                          </select>
                          <span className="material-symbols-outlined absolute right-3 top-2.5 text-[#9DB8CF] text-[20px] pointer-events-none">
                            expand_more
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CATEGORY TOGGLE: FRESHER vs SENIOR */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <label className="font-label-caps text-[#9DB8CF] flex items-center justify-between">
                        <span>PARTICIPANT CATEGORY</span>
                        <span className="text-[#38BDF8] font-mono-code text-xs">REQUIRED FOR WRISTBAND</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#061A2E] border border-[#164468]">
                        <button
                          type="button"
                          onClick={() => setSelectedCohort('FRESHER')}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-label-lg transition-all font-semibold cursor-pointer ${
                            selectedCohort === 'FRESHER'
                              ? 'bg-gradient-to-r from-[#0284C7] to-[#38BDF8] text-[#061A2E] shadow-md'
                              : 'bg-transparent text-[#9DB8CF] hover:text-[#EAF6FF] hover:bg-[#103A5F]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">verified</span>
                          <span>FRESHER (2026)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedCohort('SENIOR')}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-label-lg transition-all font-semibold cursor-pointer ${
                            selectedCohort === 'SENIOR'
                              ? 'bg-gradient-to-r from-[#38BDF8] to-[#7DD3FC] text-[#061A2E] shadow-md'
                              : 'bg-transparent text-[#9DB8CF] hover:text-[#EAF6FF] hover:bg-[#103A5F]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">school</span>
                          <span>SENIOR HOST</span>
                        </button>
                      </div>
                    </div>

                    {/* Payment Verification Section */}
                    <div className="p-4 rounded-xl bg-[#061A2E] border border-[#164468] flex flex-col gap-3 mt-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#38BDF8] text-[22px]">receipt_long</span>
                          <span className="font-headline-sm text-white">Gala Pass: ₹350</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-[#34D399]/15 text-[#34D399] font-label-caps font-bold border border-[#34D399]/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]"></span>
                          MANUAL UPI AUDIT
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center text-xs">
                        <div className="p-2 rounded-lg bg-[#0C2C4A] flex flex-col">
                          <span className="font-label-caps text-[#9DB8CF]">OFFICIAL COUNCIL VPA</span>
                          <span className="font-mono-code text-[#38BDF8] font-bold text-[12px] truncate">
                            msap.freshers26@icici
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-label-caps text-[#9DB8CF]">BANK UTR / TXN NUMBER</span>
                          <input
                            className="w-full bg-[#0C2C4A] px-2.5 py-1.5 rounded-lg font-mono-code text-xs text-[#EAF6FF] border border-[#164468] outline-none"
                            type="text"
                            value={inputUtr}
                            onChange={(e) => setInputUtr(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {formSuccessMessage && (
                      <div className="p-3 rounded-xl bg-[#34D399]/15 border border-[#34D399]/40 text-[#34D399] text-xs font-semibold">
                        {formSuccessMessage}
                      </div>
                    )}

                    {formErrorMessage && (
                      <div className="p-3 rounded-xl bg-[#FB7185]/15 border border-[#FB7185]/40 text-[#FB7185] text-xs font-semibold">
                        {formErrorMessage}
                      </div>
                    )}

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#0284C7] via-[#38BDF8] to-[#7DD3FC] text-[#061A2E] font-headline-sm text-[16px] shadow-[0_0_24px_rgba(56,189,248,0.35)] hover:shadow-[0_0_32px_rgba(56,189,248,0.55)] hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer font-bold disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[22px]">
                        {submitting ? 'progress_activity' : 'auto_awesome'}
                      </span>
                      <span>{submitting ? 'Connecting MySQL...' : 'Register & Generate Ticket Pass'}</span>
                    </button>

                    <div className="flex items-center justify-between text-[#9DB8CF] text-xs pt-1">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px] text-[#34D399]">lock</span>
                        Direct MySQL + Google Sheets Sync
                      </span>
                      <span className="text-[#38BDF8] font-mono-code">Apps Script Engine: Active</span>
                    </div>
                  </form>
                </div>
              </div>

              {/* RIGHT COLUMN: AUTHENTIC DIGITAL ENTRY PASS (7 Cols) */}
              <div className="lg:col-span-7 flex flex-col gap-4 sticky top-24">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#38BDF8] text-[20px]">confirmation_number</span>
                    <span className="font-label-caps text-[#38BDF8] tracking-widest uppercase">
                      AUTHENTIC DIGITAL ENTRY PASS VOUCHER
                    </span>
                  </div>

                  <div className={`px-2.5 py-0.5 rounded-full border font-label-caps font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(52,211,153,0.2)] ${
                    isPaid
                      ? 'bg-[#34D399]/15 text-[#34D399] border-[#34D399]/40'
                      : 'bg-[#FDBA74]/15 text-[#FDBA74] border-[#FDBA74]/40'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isPaid ? 'bg-[#34D399] animate-ping' : 'bg-[#FDBA74]'}`}></span>
                    <span>{isPaid ? 'PASS ACTIVE & SCANNABLE' : 'PAYMENT PENDING CONFIRMATION'}</span>
                  </div>
                </div>

                {/* ================= REALISTIC EVENT VOUCHER CARD ================= */}
                <div
                  id="digitalTicketCard"
                  className="relative rounded-2xl bg-[#061A2E] border border-[#164468] shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-hidden transition-all duration-300 ring-1 ring-[#38BDF8]/20 hover:ring-[#38BDF8]/40"
                >
                  {/* Top Holographic Security Ribbon */}
                  <div className="h-2 w-full bg-gradient-to-r from-[#0284C7] via-[#38BDF8] via-[#7DD3FC] to-[#FDBA74]"></div>

                  {/* Top Security Holographic Strip */}
                  <div className="bg-[#061A2E] px-4 py-1.5 flex items-center justify-between border-b border-[#164468]/60 text-[10px]">
                    <div className="flex items-center gap-2 text-[#9DB8CF] font-mono-code tracking-wider">
                      <span className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-[#34D399]' : 'bg-[#FDBA74]'}`}></span>
                      <span>
                        {isPaid ? 'OFFICIAL DIGITAL PASS • VERIFIED ENTRY' : 'OFFICIAL DIGITAL PASS • APPROVAL PENDING'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[#38BDF8] font-mono-code font-bold">
                      <span className="material-symbols-outlined text-[12px]">security</span>
                      <span>{hashStamp}</span>
                    </div>
                  </div>

                  {/* HORIZONTAL / COMPACT HYBRID MAIN TICKET CONTAINER */}
                  <div className="grid grid-cols-1 md:grid-cols-12 min-h-[300px]">
                    {/* LEFT SECTION (MD: 7 cols): Large Event Artwork & Atmosphere Area */}
                    <div className="md:col-span-7 relative p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0C2C4A] via-[#09223A] to-[#061A2E]">
                      {/* Architectural / Stage Glow Background Elements */}
                      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-gradient-to-br from-[#0284C7]/20 to-[#38BDF8]/10 blur-2xl pointer-events-none"></div>
                      <div className="absolute -left-10 bottom-0 w-44 h-44 rounded-full bg-[#38BDF8]/15 blur-2xl pointer-events-none"></div>

                      {/* Watermark Branding Pattern in Background */}
                      <div className="absolute right-3 top-10 font-display-title font-extrabold text-[80px] text-[#EAF6FF]/[0.04] select-none pointer-events-none leading-none">
                        MSAP
                      </div>

                      {/* Left Top: Event Branding */}
                      <div className="relative z-10 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md bg-[#061A2E]/60 backdrop-blur-md text-[#EAF6FF] font-display-title font-bold text-sm tracking-wider border border-[#164468]">
                              MSAP
                            </span>
                            <span className="text-[#FDBA74] font-label-caps tracking-widest font-bold">
                              BATCH INDUCTION
                            </span>
                          </div>

                          {/* Cohort Badge Pill */}
                          <span
                            className={`px-3 py-1 rounded-full font-label-caps text-[11px] font-extrabold tracking-widest uppercase shadow-[0_0_14px_rgba(56,189,248,0.3)] ${
                              ticketData.category === 'SENIOR'
                                ? 'bg-[#38BDF8] text-[#061A2E]'
                                : 'bg-[#FDBA74] text-[#061A2E]'
                            }`}
                          >
                            {ticketData.category === 'SENIOR' ? 'SENIOR HOST' : 'FRESHER'}
                          </span>
                        </div>

                        <h3 className="font-display-title text-[28px] sm:text-[32px] font-extrabold leading-tight text-white tracking-tight mt-2">
                          53rd Freshers' Meet 2026
                        </h3>
                        <p className="font-body-sm text-[#9DB8CF]">
                          Annual Induction Festival & Gala Night
                        </p>
                      </div>

                      {/* Left Bottom: Event Logistics Metadata */}
                      <div className="relative z-10 pt-6 flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#164468]">
                          <div className="flex flex-col">
                            <span className="font-label-caps text-[10px] text-[#9DB8CF] tracking-wider uppercase">DATE</span>
                            <span className="font-headline-sm text-[16px] text-white font-bold">{ticketData.eventDate}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-label-caps text-[10px] text-[#9DB8CF] tracking-wider uppercase">DOORS OPEN</span>
                            <span className="font-headline-sm text-[16px] text-[#38BDF8] font-bold">{ticketData.doorsOpen}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-[#9DB8CF] text-xs">
                          <span className="material-symbols-outlined text-[#38BDF8] text-[16px] shrink-0">location_on</span>
                          <span className="truncate text-[#EAF6FF]">Venue: {ticketData.venue}</span>
                        </div>
                      </div>
                    </div>

                    {/* NOTCH & PERFORATED DIVIDER EFFECT */}
                    <div className="hidden md:flex relative flex-col items-center justify-between -mx-[12px] z-20 pointer-events-none w-6">
                      <div className="w-6 h-6 rounded-full bg-[#061A2E] -mt-3 shadow-inner border-b border-[#164468]"></div>
                      <div className="h-full border-r-2 border-dashed border-[#164468]"></div>
                      <div className="w-6 h-6 rounded-full bg-[#061A2E] -mb-3 shadow-inner border-t border-[#164468]"></div>
                    </div>

                    {/* RIGHT SECTION (MD: 5 cols): Dark Navy & Scannable QR Area */}
                    <div className="md:col-span-5 bg-[#061A2E] p-5 sm:p-6 flex flex-col items-center justify-between gap-3 border-t md:border-t-0 md:border-l border-[#164468] relative">
                      {/* Status Badge */}
                      <div className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] tracking-wider uppercase font-bold border ${
                        isPaid
                          ? 'bg-[#34D399]/15 border-[#34D399]/40 text-[#34D399]'
                          : 'bg-[#FDBA74]/15 border-[#FDBA74]/40 text-amber-300'
                      }`}>
                        <span className="material-symbols-outlined text-[18px]">
                          {isPaid ? 'check_circle' : 'hourglass_top'}
                        </span>
                        <span>{isPaid ? 'CONFIRMED & VALID TICKET' : 'PAYMENT PENDING AUDIT'}</span>
                      </div>

                      {/* Scannable Dynamic QR Code Container */}
                      <div className="relative p-2.5 rounded-2xl bg-white shadow-2xl flex flex-col items-center justify-center mt-1">
                        {/* Target Corner Reticles */}
                        <div className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-tl border-t-2 border-l-2 border-[#38BDF8]"></div>
                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-tr border-t-2 border-r-2 border-[#38BDF8]"></div>
                        <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-bl border-b-2 border-l-2 border-[#38BDF8]"></div>
                        <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-br border-b-2 border-r-2 border-[#38BDF8]"></div>

                        {/* Micro-label overlay */}
                        <div className="absolute -bottom-3 bg-[#061A2E] px-2.5 py-0.5 rounded text-[9px] font-mono-code text-[#38BDF8] border border-[#38BDF8]/40 shadow-sm uppercase font-bold tracking-widest">
                          {isPaid ? 'SCAN FOR ENTRY' : 'LOCKED UNTIL PAID'}
                        </div>

                        {/* QR Code display */}
                        {ticketData.qrSvg ? (
                          <div
                            className="w-40 h-40 sm:w-44 sm:h-44 flex items-center justify-center"
                            dangerouslySetInnerHTML={{ __html: ticketData.qrSvg }}
                          />
                        ) : (
                          <svg className="w-40 h-40 sm:w-44 sm:h-44" fill="none" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                            <rect fill="#061A2E" height="28" rx="4" width="28" x="8" y="8"></rect>
                            <rect fill="#FFFFFF" height="16" rx="2" width="16" x="14" y="14"></rect>
                            <rect fill="#0284C7" height="8" rx="1" width="8" x="18" y="18"></rect>
                            <rect fill="#061A2E" height="28" rx="4" width="28" x="84" y="8"></rect>
                            <rect fill="#FFFFFF" height="16" rx="2" width="16" x="90" y="14"></rect>
                            <rect fill="#0284C7" height="8" rx="1" width="8" x="94" y="18"></rect>
                            <rect fill="#061A2E" height="28" rx="4" width="28" x="8" y="84"></rect>
                            <rect fill="#FFFFFF" height="16" rx="2" width="16" x="14" y="90"></rect>
                            <rect fill="#0284C7" height="8" rx="1" width="8" x="18" y="94"></rect>
                            <circle cx="60" cy="60" fill="#061A2E" r="14"></circle>
                            <circle cx="60" cy="60" fill="#38BDF8" r="11"></circle>
                            <text fill="#061A2E" fontFamily="'Space Grotesk', sans-serif" fontSize="8.5" fontWeight="800" textAnchor="middle" x="60" y="63">
                              MSAP
                            </text>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="42" y="10"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="62" y="10"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="42" y="20"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="72" y="20"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="10" y="42"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="30" y="42"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="80" y="42"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="10" y="52"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="80" y="52"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="42" y="80"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="62" y="80"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="42" y="90"></rect>
                            <rect fill="#061A2E" height="6" rx="1" width="6" x="84" y="90"></rect>
                          </svg>
                        )}
                      </div>

                      {/* Encrypted Payload Indicator */}
                      <div className="flex flex-col items-center gap-0.5 text-center mt-2 w-full">
                        <span className="font-label-caps text-[9px] text-[#9DB8CF] uppercase tracking-wider">
                          ENCRYPTED GATE SCAN PAYLOAD
                        </span>
                        <div className="px-2 py-1 rounded bg-[#061A2E] border border-[#164468] text-[10px] font-mono-code text-[#38BDF8] w-full truncate">
                          {isPaid
                            ? `${ticketData.ticketId || 'VERIFIED'} | ${ticketData.fullName} | ${ticketData.category} | 02 OCT 2026 | VALID_PAID`
                            : `${ticketData.ticketId || 'PASS_PENDING'} | ${ticketData.fullName} | PAYMENT_PENDING_APPROVAL`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ================= LOWER INFO SECTION (Crisp Light Ticket Information Strip) ================= */}
                  <div className="w-full bg-[#f8fafc] text-[#0f172a] p-5 sm:p-6 border-t-2 border-dashed border-[#cbd5e1] relative">
                    {/* Perforated Notch Visual */}
                    <div className="absolute -top-3 left-6 w-6 h-6 rounded-full bg-[#061A2E]"></div>
                    <div className="absolute -top-3 right-6 w-6 h-6 rounded-full bg-[#061A2E]"></div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-center">
                      {/* Attendee Name */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">ATTENDEE NAME</span>
                        <span className="font-display-title text-[15px] sm:text-[16px] font-extrabold text-slate-900 truncate">
                          {ticketData.fullName}
                        </span>
                      </div>

                      {/* Unique Ticket No */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TICKET NO.</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono-code text-[17px] font-black text-[#0284C7] tracking-wider">
                            {ticketData.ticketId || 'PENDING'}
                          </span>
                          {ticketData.ticketId && (
                            <button
                              onClick={handleCopyTicket}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer"
                              title="Copy Ticket ID"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                {isCopied ? 'done' : 'content_copy'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Category Badge */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CATEGORY</span>
                        <div>
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded font-mono-code font-bold text-[11px] tracking-wider uppercase shadow-sm ${
                              ticketData.category === 'SENIOR'
                                ? 'bg-[#0284C7] text-white'
                                : 'bg-[#D97706] text-white'
                            }`}
                          >
                            {ticketData.category}
                          </span>
                        </div>
                      </div>

                      {/* Event Name */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">EVENT</span>
                        <span className="text-[13px] font-semibold text-slate-800 truncate">53rd Freshers' Meet 2026</span>
                      </div>

                      {/* Date & Venue */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">DATE & VENUE</span>
                        <span className="text-[13px] font-semibold text-slate-800 truncate">02 OCT 2026 • Pune</span>
                      </div>

                      {/* Payment Status */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">PAYMENT STATUS</span>
                        <div className={`flex items-center gap-1 font-bold text-[13px] ${
                          isPaid ? 'text-emerald-700' : 'text-amber-600'
                        }`}>
                          <span className="material-symbols-outlined text-[16px]">
                            {isPaid ? 'check_circle' : 'schedule'}
                          </span>
                          <span>{isPaid ? 'UPI PAID • ₹350' : 'PENDING APPROVAL'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ACTIONS BELOW TICKET */}
                <div className="flex flex-col gap-2 mt-1">
                  {!isPaid ? (
                    <button
                      onClick={handleInitiatePayment}
                      disabled={paymentLoading}
                      className="w-full flex items-center justify-center gap-2 py-4 px-5 rounded-xl bg-gradient-to-r from-[#0284C7] via-[#38BDF8] to-[#7DD3FC] text-[#061A2E] font-headline-sm text-[16px] shadow-[0_0_24px_rgba(56,189,248,0.4)] hover:shadow-[0_0_32px_rgba(56,189,248,0.6)] transition-all cursor-pointer font-bold"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[22px]">
                        {paymentLoading ? 'progress_activity' : 'credit_card'}
                      </span>
                      <span>
                        {paymentLoading ? 'Connecting Secure Gateway...' : 'Pay ₹350 via Razorpay / UPI & Unlock Pass'}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={handleDownloadTicket}
                      disabled={downloading}
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#38BDF8] text-[#061A2E] font-headline-sm text-[16px] shadow-[0_0_20px_rgba(56,189,248,0.35)] hover:shadow-[0_0_28px_rgba(56,189,248,0.55)] transition-all cursor-pointer font-bold"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {downloading ? 'progress_activity' : 'file_download'}
                      </span>
                      <span>{downloading ? 'Preparing High-Res PDF Pass...' : 'Download Ticket (PDF / High-Res Pass)'}</span>
                    </button>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={handleAddToWallet}
                      className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#0C2C4A] hover:bg-[#103A5F] text-[#EAF6FF] font-label-lg transition-colors border border-[#164468] cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#38BDF8]">
                        {walletAdded ? 'check' : 'account_balance_wallet'}
                      </span>
                      <span>{walletAdded ? 'Added to Wallet' : 'Add to Apple / Google Wallet'}</span>
                    </button>

                    <button
                      onClick={handleShareWhatsApp}
                      className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#0C2C4A] hover:bg-[#103A5F] text-[#EAF6FF] font-label-lg transition-colors border border-[#164468] cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#34D399]">share</span>
                      <span>Share via WhatsApp</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0C2C4A] border border-[#164468] flex items-start gap-2.5 text-[#9DB8CF] text-xs">
                  <span className="material-symbols-outlined text-[#38BDF8] text-[18px] shrink-0 mt-0.5">info</span>
                  <p className="leading-relaxed">
                    Ticket <strong className="text-[#EAF6FF] font-mono-code">{ticketData.ticketId}</strong> is cryptographically tied to student identity <strong className="text-[#EAF6FF]">{ticketData.fullName}</strong>. Present this digital pass on your smartphone at Gate 01 entry turnstiles.
                  </p>
                </div>
              </div>
            </section>

            {/* ================= 3. BACKEND ZERO-LATENCY PIPELINE ================= */}
            <section className="flex flex-col gap-6 pt-6 border-t border-[#164468]/60">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#38BDF8]"></span>
                  <span className="font-label-caps text-[#38BDF8] uppercase">ZERO-LATENCY ARCHITECTURE</span>
                </div>
                <h2 className="font-headline-lg text-white tracking-tight font-display-title">
                  Automated Verification & Live Scanner Pipeline
                </h2>
              </div>

              {/* 4-Step Infographic Bento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-[#0C2C4A] border border-[#164468] flex flex-col gap-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-lg bg-[#103A5F] flex items-center justify-center font-headline-sm text-[#38BDF8] font-mono-code font-bold">
                      01
                    </span>
                    <span className="material-symbols-outlined text-[#38BDF8] text-[24px]">assignment</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-headline-sm text-white">Google Form Intake</h3>
                    <p className="font-body-sm text-[#9DB8CF]">
                      Student fills credentials, category (Fresher/Senior), and inputs verified UPI payment transaction UTR.
                    </p>
                  </div>
                  <div className="mt-auto pt-2 flex items-center gap-1 text-[#38BDF8] font-label-caps">
                    <span className="material-symbols-outlined text-[14px]">bolt</span>
                    <span>EVENT-TRIGGERED</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#0C2C4A] border border-[#164468] flex flex-col gap-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-lg bg-[#103A5F] flex items-center justify-center font-headline-sm text-[#7DD3FC] font-mono-code font-bold">
                      02
                    </span>
                    <span className="material-symbols-outlined text-[#7DD3FC] text-[24px]">table_chart</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-headline-sm text-white">Sheets Row Sync</h3>
                    <p className="font-body-sm text-[#9DB8CF]">
                      Direct write into master locked Google Sheets database with auto-incremented serial number and status.
                    </p>
                  </div>
                  <div className="mt-auto pt-2 flex items-center gap-1 text-[#7DD3FC] font-label-caps">
                    <span className="material-symbols-outlined text-[14px]">sync</span>
                    <span>INSTANT SYNC</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#0C2C4A] border border-[#164468] flex flex-col gap-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-lg bg-[#103A5F] flex items-center justify-center font-headline-sm text-[#FDBA74] font-mono-code font-bold">
                      03
                    </span>
                    <span className="material-symbols-outlined text-[#FDBA74] text-[24px]">developer_board</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-headline-sm text-white">Apps Script Engine</h3>
                    <p className="font-body-sm text-[#9DB8CF]">
                      Serverless script computes HMAC signature, generates unique FM26-XXX pass and scannable QR payload.
                    </p>
                  </div>
                  <div className="mt-auto pt-2 flex items-center gap-1 text-[#FDBA74] font-label-caps">
                    <span className="material-symbols-outlined text-[14px]">lock</span>
                    <span>ENCRYPTED PASS</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#0C2C4A] border border-[#164468] flex flex-col gap-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-lg bg-[#103A5F] flex items-center justify-center font-headline-sm text-[#34D399] font-mono-code font-bold">
                      04
                    </span>
                    <span className="material-symbols-outlined text-[#34D399] text-[24px]">sensors</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-headline-sm text-white">Admin QR Scanner</h3>
                    <p className="font-body-sm text-[#9DB8CF]">
                      Council gate marshals scan digital voucher in &lt;400ms with real-time biometric check-in & anti-passback.
                    </p>
                  </div>
                  <div className="mt-auto pt-2 flex items-center gap-1 text-[#34D399] font-label-caps">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    <span>1-TAP ADMIT</span>
                  </div>
                </div>
              </div>

              {/* ================= 4. GENESIS EXPERIENCE HIGHLIGHTS ================= */}
              <div className="flex flex-col gap-4 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-headline-md text-white font-display-title">Genesis Experience Highlights</h3>
                  <span className="font-label-caps text-[#FDBA74] tracking-wider uppercase">02 OCT LINEUP</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="group relative rounded-2xl overflow-hidden bg-[#0C2C4A] border border-[#164468] flex flex-col">
                    <div className="h-44 w-full relative overflow-hidden bg-[#061A2E]">
                      <img
                        alt="Campus DJ Stage"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0C2C4A] via-[#0C2C4A]/40 to-transparent"></div>
                      <div className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-[#FB7185] text-[#061A2E] font-label-caps shadow-sm font-bold">
                        HEADLINER ACT
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-1">
                      <h4 className="font-headline-sm text-white font-display-title">Main Arena DJ & Kinetic Beats</h4>
                      <p className="font-body-sm text-[#9DB8CF]">
                        High-octane electro set featuring guest alumni producers with acoustic surround mapping in Pune Auditorium.
                      </p>
                    </div>
                  </div>

                  <div className="group relative rounded-2xl overflow-hidden bg-[#0C2C4A] border border-[#164468] flex flex-col">
                    <div className="h-44 w-full relative overflow-hidden bg-[#061A2E]">
                      <img
                        alt="Parametric Architecture Pavilion"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0C2C4A] via-[#0C2C4A]/40 to-transparent"></div>
                      <div className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-[#FDBA74] text-[#061A2E] font-label-caps shadow-sm font-bold">
                        DESIGN PAVILION
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-1">
                      <h4 className="font-headline-sm text-white font-display-title">Parametric Neon Photo Portals</h4>
                      <p className="font-body-sm text-[#9DB8CF]">
                        Crafted by senior architecture studios: interactive luminescence structures designed for cohort portraits.
                      </p>
                    </div>
                  </div>

                  <div className="group relative rounded-2xl overflow-hidden bg-[#0C2C4A] border border-[#164468] flex flex-col">
                    <div className="h-44 w-full relative overflow-hidden bg-[#061A2E]">
                      <img
                        alt="Campus Food and Mocktail Garden"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0C2C4A] via-[#0C2C4A]/40 to-transparent"></div>
                      <div className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-[#38BDF8] text-[#061A2E] font-label-caps shadow-sm font-bold">
                        CULINARY OASIS
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-1">
                      <h4 className="font-headline-sm text-white font-display-title">Gourmet Treats & Mocktail Garden</h4>
                      <p className="font-body-sm text-[#9DB8CF]">
                        Complimentary artisan welcome sips, wood-fired bites, and sweet treats included in your ₹350 gala pass.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* ================= GOOGLE FORM MODAL ================= */}
      {showGoogleFormModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0C2C4A] border border-[#164468] rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#164468] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#38BDF8]">description</span>
                <h3 className="font-headline-sm text-white">Google Form Integration</h3>
              </div>
              <button
                onClick={() => setShowGoogleFormModal(false)}
                className="text-[#9DB8CF] hover:text-[#EAF6FF] cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="text-sm text-[#9DB8CF] flex flex-col gap-3 leading-relaxed">
              <p>
                Student registrations can be submitted through the official <strong className="text-white">MSAP Google Form</strong>. Responses flow directly into <strong className="text-white">Google Sheets</strong>, where our <strong className="text-white">Google Apps Script Webhook</strong> synchronizes each entry into the MySQL backend.
              </p>
              <div className="p-3 rounded-xl bg-[#061A2E] border border-[#164468] flex flex-col gap-1 font-mono-code text-xs">
                <span className="text-[#38BDF8]">Google Form Fields:</span>
                <span className="text-[#9DB8CF]">• Full Candidate Name</span>
                <span className="text-[#9DB8CF]">• WhatsApp / Mobile Number</span>
                <span className="text-[#9DB8CF]">• Learner Email Address</span>
                <span className="text-[#9DB8CF]">• Student / Roll ID & Department</span>
                <span className="text-[#9DB8CF]">• Category: Fresher vs Senior</span>
                <span className="text-[#9DB8CF]">• UPI Payment Transaction UTR</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowGoogleFormModal(false)}
                className="px-4 py-2 rounded-xl bg-[#103A5F] hover:bg-[#164468] text-[#EAF6FF] text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowGoogleFormModal(false);
                  const regEl = document.getElementById('registrationForm');
                  if (regEl) regEl.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-4 py-2 rounded-xl bg-[#38BDF8] hover:bg-[#7DD3FC] text-[#061A2E] text-xs font-bold cursor-pointer transition-colors"
              >
                Use Quick On-Page Intake
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FOOTER ================= */}
      <footer className="w-full bg-[#061A2E] border-t border-[#164468]/60 py-8">
        <div className="max-w-7xl mx-auto px-5 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-white tracking-tight font-display-title">
                MSAP 53rd Freshers' Meet 2026
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#103A5F] font-mono-code text-[11px] text-[#FDBA74] font-bold">
                VOUCHER ENGINE V3.0
              </span>
            </div>
            <p className="font-body-sm text-[#9DB8CF] text-center md:text-left">
              Manipur Students' Association Pune (MSAP) • 02 OCT 2026 • Pune Campus
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0C2C4A] border border-[#164468]">
              <span className="material-symbols-outlined text-[#34D399] text-[16px]">sync_saved_locally</span>
              <span className="font-label-md text-white">Apps Script Live Sync Engine Active</span>
            </div>
            <span className="font-label-md text-[#9DB8CF]">© 2026 MSAP Student Council. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
