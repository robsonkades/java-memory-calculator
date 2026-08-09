export default function GuidesLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="px-4 py-8 max-w-3xl mx-auto">
            {children}
        </div>
    );
}
