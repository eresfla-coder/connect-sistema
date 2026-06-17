"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { emailDoUsuarioAuth } from "@/lib/access";
import { readLocalCloudPayload } from "@/lib/connect-cloud-storage";
import { nomeArquivoBackup } from "@/lib/backup-connect";
import { installDemoGuard, isDemoMode, limparSessaoReal, sairDemoMode } from "@/lib/connect-demo";
import dynamic from "next/dynamic";
import ConnectToastProvider from "@/components/ui/ConnectToast";
import WhatsAppFallbackBar from "@/components/WhatsAppFallbackBar";
import { abrirWhatsappUrl, montarUrlWhatsapp, WHATSAPP_FALLBACK_EVENT } from "@/lib/abrirExterno";
import {
  contarOrcamentosPainelSync,
  contarOrdensPainelSync,
  lerOrcamentosPainelSync,
} from "@/lib/orcamentos-local";
import { obterUserIdPainel } from "@/lib/connect-user-storage";

const TrialBanner = dynamic(() => import("@/components/assinatura/TrialBanner"), { ssr: false });

const OnboardingChecklistPanel = dynamic(
  () => import("@/components/onboarding/OnboardingChecklistPanel"),
  { ssr: false },
);

type MenuItem = {
  nome: string;
  href: string;
  icone: string;
  destaque?: boolean;
  badge?: string;
};

const FINANCEIRO_KEY = "connect_financeiro_titulos";
const WHATSAPP_SUPORTE = "5584992181399";
const THEME_KEY = "connect_theme";

async function obterEmailLogadoPainel(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const userSessao = session?.user ?? null;

  let email =
    String(userSessao?.email || "").trim().toLowerCase() ||
    emailDoUsuarioAuth(userSessao);

  if (!email) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) {
      email =
        String(user.email || "").trim().toLowerCase() ||
        emailDoUsuarioAuth(user);
    }
  }

  if (!email && userSessao?.id) {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("email")
      .eq("id", userSessao.id)
      .maybeSingle<{ email?: string | null }>();

    email = String(perfil?.email || "").trim().toLowerCase();
  }

  return email;
}

async function verificarAdminViaApi(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return false;
  try {
    const resp = await fetch("/api/assinatura/status", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await resp.json().catch(() => null);
    return Boolean(payload?.isAdminMaster);
  } catch {
    return false;
  }
}

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [menuAberto, setMenuAberto] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [itemPressionado, setItemPressionado] = useState<string | null>(null);
  const [orcamentosBadge, setOrcamentosBadge] = useState("0");
  const [osBadge, setOsBadge] = useState("0");
  const [resumoCRMBadge, setResumoCRMBadge] = useState("0");
  const [horaAtual, setHoraAtual] = useState("");
  const [dataAtual, setDataAtual] = useState("");
  const [avisoTrial, setAvisoTrial] = useState("");
  const [temaVisual, setTemaVisual] = useState<"dark" | "light">("light");
  const [saindo, setSaindo] = useState(false);
  const [adminLogado, setAdminLogado] = useState(false);
  const [demoAtivo, setDemoAtivo] = useState(false);
  const [whatsappFallbackUrl, setWhatsappFallbackUrl] = useState<string | null>(null);


  useEffect(() => {
    installDemoGuard();
    const atualizarDemo = () => setDemoAtivo(isDemoMode());
    atualizarDemo();
    window.addEventListener("storage", atualizarDemo);
    window.addEventListener("focus", atualizarDemo);
    return () => {
      window.removeEventListener("storage", atualizarDemo);
      window.removeEventListener("focus", atualizarDemo);
    };
  }, []);

  useEffect(() => {
    let ativo = true;

    async function aplicarAdminDetectado(adminMaster: boolean) {
      if (!ativo) return;
      setAdminLogado(adminMaster);
    }

    async function resolverAdmin(tentativas = 5) {
      try {
        if (isDemoMode()) {
          if (ativo) setAdminLogado(false);
          return;
        }

        for (let i = 1; i <= tentativas; i += 1) {
          const adminMaster = await verificarAdminViaApi();
          if (adminMaster) {
            await aplicarAdminDetectado(true);
            return;
          }
          if (i < tentativas) {
            await new Promise((resolve) => setTimeout(resolve, 180 + i * 120));
          } else if (ativo) {
            setAdminLogado(false);
          }
        }
      } catch {
        if (ativo) setAdminLogado(false);
      }
    }

    void resolverAdmin();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ativo) return;
      if (isDemoMode()) {
        setAdminLogado(false);
        return;
      }
      if (session?.access_token) {
        void verificarAdminViaApi().then((ok) => {
          if (ativo) setAdminLogado(ok);
        });
        return;
      }

      void resolverAdmin(3);
    });

    const onFocus = () => {
      void resolverAdmin();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      ativo = false;
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  useEffect(() => {
    const verificarTela = () => {
      setIsMobile(window.innerWidth <= 900);
    };

    verificarTela();
    window.addEventListener("resize", verificarTela);
    return () => window.removeEventListener("resize", verificarTela);
  }, []);

  useEffect(() => {
    // V78: não bloquear overflow do body no Chrome mobile.
    // Esse bloqueio foi a causa mais comum de travamento no primeiro toque/ao trocar módulo.
    document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, menuAberto]);

  useEffect(() => {
    let ativo = true;

    async function atualizarBadges() {
      const userId = await obterUserIdPainel();
      if (!ativo) return;

      setOrcamentosBadge(String(contarOrcamentosPainelSync(userId)));
      setOsBadge(String(contarOrdensPainelSync(userId)));

      try {
        const orcs = lerOrcamentosPainelSync(userId);
        const rawFin = localStorage.getItem(FINANCEIRO_KEY);
        const fins = rawFin ? JSON.parse(rawFin) : [];
        const pendentes = orcs.filter((o) => {
          const status = String(o?.status || "").toLowerCase();
          return !status.includes("aprov") && !status.includes("cancel");
        }).length;
        const abertos = Array.isArray(fins)
          ? fins.filter(
              (f: any) =>
                !String(f?.status || "")
                  .toLowerCase()
                  .includes("pago"),
            ).length
          : 0;
        setResumoCRMBadge(String(Math.min(99, pendentes + abertos)));
      } catch {
        setResumoCRMBadge("0");
      }
    }

    void atualizarBadges();
    const onBadges = () => void atualizarBadges();
    window.addEventListener("storage", onBadges);
    window.addEventListener("connect-data-change", onBadges);
    window.addEventListener("connect-local-saved", onBadges);

    return () => {
      ativo = false;
      window.removeEventListener("storage", onBadges);
      window.removeEventListener("connect-data-change", onBadges);
      window.removeEventListener("connect-local-saved", onBadges);
    };
  }, []);

  useEffect(() => {
    try {
      const aviso = sessionStorage.getItem("connect_trial_notice") || "";
      setAvisoTrial(aviso);
    } catch {}
  }, [pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      const url = String((event as CustomEvent<{ url?: string }>).detail?.url || "").trim();
      if (url) setWhatsappFallbackUrl(url);
    };
    window.addEventListener(WHATSAPP_FALLBACK_EVENT, handler);
    return () => window.removeEventListener(WHATSAPP_FALLBACK_EVENT, handler);
  }, []);

  useEffect(() => {
    function atualizarRelogio() {
      const agora = new Date();
      setHoraAtual(
        agora.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setDataAtual(
        agora.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
        }),
      );
    }

    atualizarRelogio();
    const interval = window.setInterval(atualizarRelogio, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(THEME_KEY);
      if (salvo === "light" || salvo === "dark") {
        setTemaVisual(salvo);
        return;
      }
      localStorage.setItem(THEME_KEY, "light");
      setTemaVisual("light");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, temaVisual);
      window.dispatchEvent(
        new CustomEvent("connect-theme-change", { detail: temaVisual }),
      );
    } catch {}
    document.documentElement.dataset.connectTheme = temaVisual;
  }, [temaVisual]);

  function alternarTema() {
    setTemaVisual((atual) => (atual === "dark" ? "light" : "dark"));
  }

  function abrirWhatsApp() {
    if (isDemoMode()) {
      alert("Modo demonstração: WhatsApp real bloqueado. Crie uma conta grátis de 7 dias para falar pelo sistema.");
      return;
    }
    try {
      const mensagem =
        "Olá! Gostaria de falar com o suporte da Connect Sistemas.";
      const url = montarUrlWhatsapp(WHATSAPP_SUPORTE, mensagem);
      abrirWhatsappUrl(url);
    } catch (error) {
      console.error("Erro ao abrir WhatsApp:", error);
      alert("Não foi possível abrir o WhatsApp.");
    }
  }

  function exportarDados() {
    if (isDemoMode()) {
      alert("Modo demonstração: exportação de dados bloqueada. Crie uma conta grátis de 7 dias para usar backup real.");
      return;
    }
    try {
      const payload = readLocalCloudPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivoBackup();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar dados:", error);
      alert("Não foi possível exportar os dados agora.");
    }
  }

  async function handleLogout() {
    if (saindo) return;
    setSaindo(true);
    try {
      if (isDemoMode()) {
        sairDemoMode();
        limparSessaoReal();
        router.push("/login");
        return;
      }
      await supabase.auth.signOut();
      limparSessaoReal();
      router.push("/login");
    } catch (error) {
      console.error("Erro ao sair:", error);
      setSaindo(false);
      alert("Não foi possível sair agora. Tente novamente.");
    }
  }

  const menu: MenuItem[] = useMemo(
    () => [
      { nome: "Dashboard", href: "/dashboard", icone: "📊" },
      ...(adminLogado
        ? [{ nome: "Painel Admin", href: "/admin", icone: "🛡️", destaque: true } as MenuItem]
        : []),
      {
        nome: "Orçamentos",
        href: "/orcamentos",
        icone: "💰",
        destaque: true,
        badge: orcamentosBadge,
      },
      {
        nome: "OS / Recibos",
        href: "/ordens-servico",
        icone: "🔧",
        badge: osBadge,
      },
      { nome: "Clientes", href: "/clientes", icone: "👥" },
      { nome: "Contratos", href: "/contratos", icone: "📄" },
      { nome: "CRM", href: "/crm", icone: "🤖", badge: resumoCRMBadge },
      { nome: "Connect AI", href: "/connect-ai", icone: "✨", destaque: true },
      { nome: "Produtos", href: "/produtos", icone: "📦" },
      { nome: "Financeiro", href: "/financeiro", icone: "💸" },
      { nome: "Assinatura", href: "/assinatura", icone: "💳" },
      { nome: "Config", href: "/configuracoes", icone: "⚙️" },
    ],
    [orcamentosBadge, osBadge, resumoCRMBadge, adminLogado],
  );

  function estiloMenuItem(item: MenuItem, ativo: boolean) {
    const base: Record<string, { bg: string; shadow: string; border: string }> =
      {
        Dashboard: {
          bg: "linear-gradient(135deg,#2563eb 0%,#1d4ed8 50%,#0f4ed8 100%)",
          shadow: "0 14px 30px rgba(37,99,235,.28)",
          border: "1px solid rgba(147,197,253,.42)",
        },
        Orçamentos: {
          bg: "linear-gradient(135deg,#22c55e 0%,#16a34a 52%,#047857 100%)",
          shadow: "0 14px 30px rgba(34,197,94,.26)",
          border: "1px solid rgba(134,239,172,.42)",
        },
        "OS / Recibos": {
          bg: "linear-gradient(135deg,#0ea5e9 0%,#2563eb 52%,#1e3a8a 100%)",
          shadow: "0 14px 30px rgba(14,165,233,.23)",
          border: "1px solid rgba(125,211,252,.38)",
        },
        Clientes: {
          bg: "linear-gradient(135deg,#8b5cf6 0%,#7c3aed 50%,#4c1d95 100%)",
          shadow: "0 14px 30px rgba(139,92,246,.22)",
          border: "1px solid rgba(196,181,253,.35)",
        },
        CRM: {
          bg: "linear-gradient(135deg,#ec4899 0%,#8b5cf6 48%,#3730a3 100%)",
          shadow: "0 14px 30px rgba(236,72,153,.20)",
          border: "1px solid rgba(244,114,182,.34)",
        },
        "Connect AI": {
          bg: "linear-gradient(135deg,#10b981 0%,#06b6d4 54%,#2563eb 100%)",
          shadow: "0 14px 30px rgba(6,182,212,.22)",
          border: "1px solid rgba(103,232,249,.38)",
        },
        Produtos: {
          bg: "linear-gradient(135deg,#f97316 0%,#ea580c 52%,#9a3412 100%)",
          shadow: "0 14px 30px rgba(249,115,22,.22)",
          border: "1px solid rgba(253,186,116,.38)",
        },
        Financeiro: {
          bg: "linear-gradient(135deg,#84cc16 0%,#16a34a 52%,#065f46 100%)",
          shadow: "0 14px 30px rgba(34,197,94,.22)",
          border: "1px solid rgba(190,242,100,.35)",
        },
        Assinatura: {
          bg: "linear-gradient(135deg,#f59e0b 0%,#2563eb 52%,#1e1b4b 100%)",
          shadow: "0 14px 30px rgba(245,158,11,.22)",
          border: "1px solid rgba(251,191,36,.38)",
        },
        "Painel Admin": {
          bg: "linear-gradient(135deg,#111827 0%,#7c3aed 52%,#0f172a 100%)",
          shadow: "0 14px 30px rgba(124,58,237,.26)",
          border: "1px solid rgba(196,181,253,.38)",
        },
        Config: {
          bg: "linear-gradient(135deg,#64748b 0%,#334155 52%,#0f172a 100%)",
          shadow: "0 14px 30px rgba(15,23,42,.20)",
          border: "1px solid rgba(203,213,225,.28)",
        },
      };

    const visual = base[item.nome] || base.Dashboard;

    if (itemPressionado === item.href) {
      return {
        background: visual.bg,
        boxShadow: "0 4px 12px rgba(15,23,42,.25)",
        border: visual.border,
        transform: "scale(.975) translateY(1px)",
      };
    }

    if (ativo) {
      return {
        background: visual.bg,
        boxShadow:
          temaVisual === "light"
            ? `${visual.shadow}, 0 0 0 3px rgba(255,255,255,.95), 0 0 0 6px rgba(37,99,235,.32)`
            : `${visual.shadow}, 0 0 0 3px rgba(15,23,42,.92), 0 0 0 6px rgba(96,165,250,.35)`,
        border: "2px solid rgba(255,255,255,.92)",
        transform: "scale(1.018)",
        outline: "2px solid rgba(15,23,42,.10)",
      };
    }

    return {
      background: visual.bg,
      boxShadow:
        temaVisual === "light"
          ? "0 10px 22px rgba(15,23,42,.10)"
          : visual.shadow,
      border: visual.border,
      transform: "scale(1)",
      opacity: 0.96,
    };
  }

  function fecharMenuMobile() {
    if (isMobile) setMenuAberto(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          temaVisual === "light"
            ? "linear-gradient(180deg,#f4f7fb 0%, #eef4ff 52%, #f8fbff 100%)"
            : "linear-gradient(180deg,#111827 0%, #182235 100%)",
      }}
    >
      <button
        onClick={() => setMenuAberto(!menuAberto)}
        style={{
          position: "fixed",
          top: isMobile ? "calc(env(safe-area-inset-top, 0px) + 12px)" : 18,
          left: isMobile ? "max(16px, env(safe-area-inset-left, 0px))" : 16,
          zIndex: 10080,
          width: 50,
          height: 50,
          borderRadius: 15,
          border: "1px solid rgba(96,165,250,.30)",
          background:
            temaVisual === "light"
              ? "linear-gradient(135deg,#2563eb,#1d4ed8)"
              : "linear-gradient(135deg,#2563eb,#1d4ed8)",
          color: "#fff",
          fontSize: 22,
          cursor: "pointer",
          display: isMobile ? "block" : "none",
          boxShadow: "0 12px 28px rgba(37,99,235,0.34)",
          transform: menuAberto && isMobile ? "scale(.92)" : "scale(1)",
          transition: "transform .18s ease, top .18s ease, left .18s ease",
        }}
      >
        {menuAberto && isMobile ? "×" : "☰"}
      </button>

      {adminLogado && isMobile ? (
        <Link
          href="/admin"
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            right: "max(12px, env(safe-area-inset-right, 0px))",
            zIndex: 10080,
            textDecoration: "none",
            minHeight: 44,
            padding: "0 12px",
            borderRadius: 14,
            border: "1px solid rgba(196,181,253,.45)",
            background: "linear-gradient(135deg,#111827 0%,#7c3aed 52%,#0f172a 100%)",
            color: "#fff",
            fontWeight: 900,
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 10px 22px rgba(124,58,237,.22)",
          }}
        >
          🛡️ Painel Admin
        </Link>
      ) : null}

      {false && menuAberto && isMobile && (
        <div
          onClick={() => setMenuAberto(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 40,
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          style={{
            width: isMobile ? "84vw" : 245,
            background:
              temaVisual === "light"
                ? "linear-gradient(180deg,#ffffff 0%, #f7faff 100%)"
                : "linear-gradient(180deg, rgba(17,24,39,0.94) 0%, rgba(30,41,59,0.96) 100%)",
            padding: isMobile ? 12 : 14,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            borderRight:
              temaVisual === "light"
                ? "1px solid rgba(37,99,235,0.10)"
                : "1px solid rgba(255,255,255,0.08)",
            boxShadow:
              temaVisual === "light"
                ? "10px 0 30px rgba(15,23,42,0.08)"
                : "8px 0 24px rgba(0,0,0,0.18)",
            position: isMobile ? "fixed" : "relative",
            top: 0,
            left: 0,
            transform: isMobile
              ? menuAberto
                ? "translateX(0)"
                : "translateX(-105%)"
              : "translateX(0)",
            height: isMobile ? "100dvh" : "100vh",
            zIndex: 10000,
            transition: "transform 0.22s ease",
            overflowY: "auto",
            overscrollBehavior: "contain",
            maxWidth: isMobile ? 310 : 245,
            willChange: "transform",
          }}
        >
          <div>
            <div
              style={{
                textAlign: "center",
                marginBottom: 12,
                paddingTop: isMobile
                  ? "calc(env(safe-area-inset-top, 0px) + 58px)"
                  : 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <img
                src="/logo-connect.png"
                alt="Connect Sistema"
                style={{
                  width: isMobile ? 50 : 42,
                  maxWidth: "28%",
                  height: "auto",
                  objectFit: "contain",
                  borderRadius: 8,
                  background: "transparent",
                  padding: 0,
                  boxShadow: "none",
                  display: "block",
                  margin: "0 auto",
                }}
              />
              <div
                style={{
                  color: temaVisual === "light" ? "#0f172a" : "#fff",
                  fontWeight: 900,
                  marginTop: 1,
                  fontSize: isMobile ? 11 : 11,
                  lineHeight: 1.15,
                  letterSpacing: 0.5,
                }}
              >
                CONNECT SISTEMA
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <button
                onClick={alternarTema}
                title="Alternar tema"
                style={{
                  width: 78,
                  height: 34,
                  borderRadius: 999,
                  border:
                    temaVisual === "light"
                      ? "1px solid #dbeafe"
                      : "1px solid rgba(255,255,255,.12)",
                  background: temaVisual === "light" ? "#eef4ff" : "#1e293b",
                  cursor: "pointer",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 9px",
                  boxShadow:
                    temaVisual === "light"
                      ? "0 8px 20px rgba(15,23,42,.06)"
                      : "0 8px 18px rgba(0,0,0,.25)",
                }}
              >
                <span style={{ fontSize: 14 }}>☀️</span>
                <span style={{ fontSize: 14 }}>🌙</span>
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: temaVisual === "light" ? 41 : 3,
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: "#fff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
                    transition: "left .2s ease",
                  }}
                />
              </button>
            </div>

            <nav style={{ display: "grid", gap: 9 }}>
              {menu.map((item) => {
                const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    onClick={() => {
                      fecharMenuMobile();
                    }}
                    onMouseDown={() => setItemPressionado(item.href)}
                    onMouseUp={() => setItemPressionado(null)}
                    onMouseLeave={() => setItemPressionado(null)}
                    onTouchStart={() => setItemPressionado(item.href)}
                    onTouchEnd={() => setItemPressionado(null)}
                    style={{ textDecoration: "none" }}
                  >
                    <div
                      style={{
                        padding: "11px 13px",
                        minHeight: 45,
                        borderRadius: 16,
                        ...estiloMenuItem(item, ativo),
                        color: "#fff",
                        fontWeight: 900,
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        transition:
                          "transform .14s ease, box-shadow .18s ease, background .18s ease, border .18s ease",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {ativo && (
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 8,
                            bottom: 8,
                            width: 5,
                            borderRadius: "0 999px 999px 0",
                            background: "#ffffff",
                            boxShadow: "0 0 16px rgba(255,255,255,.95)",
                          }}
                        />
                      )}
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 10,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: ativo ? "rgba(255,255,255,.34)" : "rgba(255,255,255,.18)",
                            boxShadow: ativo
                              ? "inset 0 0 0 1px rgba(255,255,255,.55), 0 6px 14px rgba(15,23,42,.20)"
                              : "inset 0 0 0 1px rgba(255,255,255,.22)",
                          }}
                        >
                          {item.icone}
                        </span>
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.nome}
                        </span>
                      </span>

                      {item.badge && item.badge !== "0" ? (
                        <span
                          style={{
                            minWidth: 22,
                            height: 22,
                            padding: "0 7px",
                            borderRadius: 999,
                            background: ativo
                              ? "rgba(255,255,255,0.22)"
                              : "rgba(15,23,42,0.08)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 900,
                            boxShadow: ativo
                              ? "inset 0 0 0 1px rgba(255,255,255,0.22)"
                              : "inset 0 0 0 1px rgba(15,23,42,0.08)",
                          }}
                        >
                          {ativo ? "✓" : item.badge}
                        </span>
                      ) : ativo ? (
                        <span
                          style={{
                            padding: "4px 7px",
                            borderRadius: 999,
                            background: "rgba(255,255,255,.22)",
                            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.24)",
                            fontSize: 10,
                            fontWeight: 950,
                            letterSpacing: .2,
                          }}
                        >
                          ATIVO
                        </span>
                      ) : item.destaque ? (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: "#ffffff",
                            boxShadow: "0 0 12px rgba(255,255,255,0.85)",
                          }}
                        />
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </nav>

            <button
              onClick={abrirWhatsApp}
              style={{
                width: "100%",
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 16,
                border: "1px solid rgba(34,197,94,.25)",
                background: "linear-gradient(135deg,#16a34a,#065f46)",
                color: "#fff",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: "0 8px 20px rgba(34,197,94,0.22)",
                transition: "transform .14s ease, box-shadow .18s ease",
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.985)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              💬 Suporte
            </button>
          </div>

          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop:
                temaVisual === "light"
                  ? "1px solid rgba(15,23,42,0.08)"
                  : "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <img
                src="/logo-connect.png"
                alt="Connect Sistemas"
                style={{
                  width: 28,
                  height: 28,
                  objectFit: "contain",
                  borderRadius: 8,
                  background: "transparent",
                  padding: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: temaVisual === "light" ? "#94a3b8" : "#cbd5e1",
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  Desenvolvido por
                </div>
                <div
                  style={{
                    color: temaVisual === "light" ? "#0f172a" : "#fff",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  Connect Sistemas
                </div>
              </div>
            </div>

            <button
              onClick={exportarDados}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 16,
                border: temaVisual === "light" ? "1px solid #dbeafe" : "1px solid rgba(255,255,255,.12)",
                background: temaVisual === "light" ? "linear-gradient(135deg,#eff6ff,#dbeafe)" : "linear-gradient(135deg,#1e293b,#0f172a)",
                color: temaVisual === "light" ? "#1d4ed8" : "#dbeafe",
                fontWeight: 900,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              💾 Exportar dados
            </button>

            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 16,
                border: "none",
                background: saindo
                  ? "linear-gradient(135deg,#991b1b,#dc2626)"
                  : "linear-gradient(135deg,#ef4444,#b91c1c)",
                color: "#fff",
                fontWeight: 900,
                fontSize: 13,
                cursor: saindo ? "wait" : "pointer",
              }}
            >
              {saindo ? "Saindo..." : "Sair"}
            </button>
          </div>
        </aside>

        <main
          className="connect-painel-main"
          style={{
            flex: 1,
            minWidth: 0,
            width: "100%",
            overflowX: isMobile ? "visible" : "hidden",
            padding: isMobile
              ? "calc(env(safe-area-inset-top, 0px) + 74px) 12px 18px"
              : "20px",
          }}
        >
          {!isMobile && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 12,
                color: temaVisual === "light" ? "#0f172a" : "#fff",
                gap: 14,
                alignItems: "center",
              }}
            >
              {adminLogado ? (
                <Link
                  href="/admin"
                  style={{
                    textDecoration: "none",
                    minHeight: 42,
                    padding: "0 16px",
                    borderRadius: 14,
                    border: "1px solid rgba(196,181,253,.45)",
                    background: "linear-gradient(135deg,#111827 0%,#7c3aed 52%,#0f172a 100%)",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 13,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: "0 10px 22px rgba(124,58,237,.22)",
                  }}
                >
                  🛡️ Painel Admin
                </Link>
              ) : null}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1 }}>
                  {horaAtual}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: temaVisual === "light" ? "#64748b" : "#cbd5e1",
                    textTransform: "capitalize",
                  }}
                >
                  {dataAtual}
                </div>
              </div>
            </div>
          )}

          {demoAtivo && (
            <div
              style={{
                marginBottom: 14,
                padding: "14px 16px",
                borderRadius: 18,
                background: temaVisual === "light"
                  ? "linear-gradient(135deg,#fff7ed,#fef3c7)"
                  : "linear-gradient(135deg,rgba(245,158,11,.18),rgba(251,191,36,.12))",
                border: "1px solid rgba(245,158,11,.38)",
                color: temaVisual === "light" ? "#7c2d12" : "#fde68a",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                fontWeight: 900,
                boxShadow: "0 14px 30px rgba(245,158,11,.14)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase" }}>Modo demonstração protegido</div>
                <div style={{ fontSize: 12, marginTop: 4, fontWeight: 750 }}>
                  Dados fictícios. Salvar, WhatsApp, links públicos, cobranças e ações reais estão bloqueados.
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push("/login")}
                style={{
                  height: 38,
                  borderRadius: 999,
                  border: "none",
                  padding: "0 14px",
                  background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                  color: "#fff",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Criar teste grátis
              </button>
            </div>
          )}

          {!adminLogado && <TrialBanner />}
          <div className="connect-page-transition-shell">{children}</div>
        </main>
      </div>
      <WhatsAppFallbackBar url={whatsappFallbackUrl} onFechar={() => setWhatsappFallbackUrl(null)} />
      <ConnectToastProvider />
      <OnboardingChecklistPanel />
    </div>
  );
}
