// src/components/Navigation.tsx
import Link from "next/link";
import { useRouter } from "next/router";

export default function Navigation() {
  const router = useRouter();
  
  const isActive = (path: string) => {
    return router.pathname === path ? "border-sky-500" : "border-transparent";
  };

  return (
    <nav className="bg-gray-800 shadow-md py-4">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap justify-between items-center">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-thin text-sky-500">
              Pellet Deployer
            </Link>
          </div>
          
          <div className="flex space-x-4">
            <Link 
              href="/" 
              className={`px-3 py-2 text-white border-b-2 hover:border-sky-400 transition ${isActive('/')}`}>
              Home
            </Link>
            <Link 
              href="/deploy-pellets" 
              className={`px-3 py-2 text-white border-b-2 hover:border-sky-400 transition ${isActive('/deploy-pellets')}`}>
              Deploy Pellets
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}