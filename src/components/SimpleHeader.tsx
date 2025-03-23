import Link from "next/link";

export default function SimpleHeader() {
  return (
    <header className="bg-gray-800 shadow-md py-4">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center">
          <Link href="/deploy-pellets" className="text-2xl font-thin text-sky-500">
            Pellet Deployer
          </Link>
        </div>
      </div>
    </header>
  );
} 