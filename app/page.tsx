import { Suspense } from 'react';
import Calculator from './Calculator';

export default function Home() {
    return (
        <Suspense>
            <Calculator />
        </Suspense>
    );
}
