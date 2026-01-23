"use client"

import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Box, Twitter, Linkedin } from "lucide-react"

export const LandingFooter = () => {
    const { t } = useTranslation()

    return (
        <footer id="footer" className="bg-slate-900 dark:bg-slate-950 text-white">
            <hr className="w-11/12 mx-auto border-border/10" />

            <section className="w-full max-w-[1400px] mx-auto px-6 py-20 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-x-12 gap-y-8">
                <div className="col-span-full xl:col-span-2">
                    <Link to="/" className="font-bold text-xl flex items-center gap-2">
                        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                            <Box className="h-5 w-5 text-primary-foreground" />
                        </div>
                        VizCad
                    </Link>
                    <p className="text-muted-foreground/60 mt-4 max-w-xs">
                        {t("footer_company_desc")}
                    </p>
                    <div className="flex gap-3 mt-4">
                        <a
                            href="https://www.linkedin.com/company/vizcad?trk=public_post_feed-actor-name"
                            className="w-8 h-8 bg-primary hover:bg-primary/80 rounded-lg flex items-center justify-center transition-colors"
                        >
                            <Linkedin className="w-4 h-4 text-primary-foreground" />
                        </a>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <h3 className="font-bold text-lg">{t("landing_footer_follow")}</h3>
                    <div>
                        <a
                            rel="noreferrer noopener"
                            href="https://github.com/Ferhatr10"
                            target="_blank"
                            className="opacity-60 hover:opacity-100 transition-opacity"
                        >
                            Github
                        </a>
                    </div>
                    <div>
                        <a
                            rel="noreferrer noopener"
                            href="https://www.linkedin.com/company/vizcad?trk=public_post_feed-actor-name"
                            className="opacity-60 hover:opacity-100 transition-opacity"
                        >
                            LinkedIn
                        </a>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <h3 className="font-bold text-lg">{t("footer_tools")}</h3>
                    <div>
                        <Link to="/app" className="opacity-60 hover:opacity-100 transition-opacity">
                            {t("nav_3d_viewer")}
                        </Link>
                    </div>
                    <div>
                        <Link to="/ModelSnap" className="opacity-60 hover:opacity-100 transition-opacity">
                            ModelSnap
                        </Link>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <h3 className="font-bold text-lg">{t("landing_footer_platforms")}</h3>
                    <div>
                        <span className="opacity-60">Web</span>
                    </div>
                    <div>
                        <span className="opacity-60">Mobile</span>
                    </div>
                    <div>
                        <span className="opacity-60">Desktop</span>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <h3 className="font-bold text-lg">{t("landing_footer_about")}</h3>
                    <div>
                        <a href="#features" className="opacity-60 hover:opacity-100 transition-opacity">
                            {t("nav_features")}
                        </a>
                    </div>
                    <div>
                        <Link to="/faq" className="opacity-60 hover:opacity-100 transition-opacity">
                            {t("nav_faq")}
                        </Link>
                    </div>
                    <div>
                        <Link to="/contact" className="opacity-60 hover:opacity-100 transition-opacity">
                            {t("nav_contact")}
                        </Link>
                    </div>
                </div>
            </section>
            <section className="w-full max-w-[1400px] mx-auto px-6 pb-14 text-center">
                <p className="text-muted-foreground/40 text-sm">{t("footer_copyright")}</p>
            </section>
        </footer>
    )
}
