export default function ArticleLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <article className="guide">{children}</article>;
}
