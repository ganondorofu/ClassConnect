
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { LogIn, User } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";

interface InitialChoiceProps {
  onChoiceMade: () => void; // Callback to hide the modal or component
}

export function InitialChoice({ onChoiceMade }: InitialChoiceProps) {
  const { setAnonymousAccess } = useAuth();
  const router = useRouter();

  const handleTeacherLogin = () => {
    onChoiceMade();
    router.push("/teacher-login");
  };

  const handleStudentLogin = () => {
    onChoiceMade();
    router.push("/student-login");
  };

  const handleAnonymousAccess = () => {
    setAnonymousAccess(true);
    onChoiceMade();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md m-4 shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">ClassConnectへようこそ</CardTitle>
          <CardDescription>
            利用方法を選択してください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <Button onClick={handleTeacherLogin} className="w-full" size="lg">
            <LogIn className="mr-2 h-5 w-5" />
            教員としてログイン
          </Button>
          <Button onClick={handleStudentLogin} className="w-full" variant="secondary" size="lg">
            <User className="mr-2 h-5 w-5" />
            学生としてログイン
          </Button>
          <Button onClick={handleAnonymousAccess} className="w-full" variant="secondary" size="lg">
            <User className="mr-2 h-5 w-5" />
            ログインなしで利用する
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
