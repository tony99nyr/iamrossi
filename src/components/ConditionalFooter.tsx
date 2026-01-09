'use client';

import { usePathname } from 'next/navigation';
import Footer from './Footer';

export default function ConditionalFooter() {
    const pathname = usePathname();
    const isGameRoute = pathname.startsWith('/games');
    const isHomepage = pathname === '/';
    const isInstagramTool = pathname.startsWith('/tools/instagram');

    if (isGameRoute || isHomepage || isInstagramTool) {
        return null;
    }

    return <Footer />;
}
