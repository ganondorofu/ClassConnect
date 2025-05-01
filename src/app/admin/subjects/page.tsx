
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout'; // Use named import
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, WifiOff, PlusCircle, Edit, Trash2, Save } from 'lucide-react';

import type { Subject } from '@/models/subject';
import { queryFnGetSubjects, addSubject, updateSubject, deleteSubject, onSubjectsUpdate } from '@/controllers/subjectController';

// Re-export QueryClientProvider for client components using queries
const queryClient = new QueryClient();

function SubjectsPageContent() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient();

  const [isOffline, setIsOffline] = useState(false);
  const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]);

  // --- State for Add/Edit Modal ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [isSaving, setIsSaving] = useState(false);


  // --- Offline Handling ---
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleQueryError = (error: unknown) => {
    console.error("Subjects Query Error:", error);
    const isOfflineError = (error as any)?.code === 'unavailable';
    setIsOffline(isOfflineError || !navigator.onLine);
  };

  // --- Fetch Initial Subjects ---
  const { data: initialSubjects, isLoading, error } = useQuery({
    queryKey: ['subjects'],
    queryFn: queryFnGetSubjects,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    onError: handleQueryError,
    enabled: !isOffline,
    refetchOnMount: true,
  });

  // --- Realtime Subscription for Subjects ---
  useEffect(() => {
    if (isOffline) return;
    const unsubscribe = onSubjectsUpdate((subjects) => {
      setLiveSubjects(subjects);
      setIsOffline(false);
    }, (error) => {
      console.error("Realtime subjects error:", error);
      setIsOffline(true);
    });
    return () => unsubscribe();
  }, [isOffline]);

  // Merge initial and live data
  const subjects = useMemo(() => liveSubjects.length > 0 ? liveSubjects : initialSubjects ?? [], [liveSubjects, initialSubjects]);


  // --- Mutations ---
  const addMutation = useMutation({
    mutationFn: ({ name, teacher }: { name: string; teacher: string }) => addSubject(name, teacher),
    onSuccess: async () => {
      toast({ title: "成功", description: "科目を追加しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['subjects'] });
      setIsModalOpen(false);
    },
    onError: (error: Error) => {
      handleMutationError(error, "追加");
    },
    onSettled: () => setIsSaving(false),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, teacher }: { id: string; name: string; teacher: string }) => updateSubject(id, name, teacher),
    onSuccess: async () => {
      toast({ title: "成功", description: "科目を更新しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['subjects'] });
      setIsModalOpen(false);
    },
    onError: (error: Error) => {
      handleMutationError(error, "更新");
    },
    onSettled: () => setIsSaving(false),
  });

   const deleteMutation = useMutation({
      mutationFn: (id: string) => deleteSubject(id),
      onSuccess: async (_, id) => {
          toast({ title: "成功", description: `科目を削除しました。` });
           await queryClientHook.invalidateQueries({ queryKey: ['subjects'] });
          // Optionally close any modal if deleting from there
      },
      onError: (error: Error) => {
          handleMutationError(error, "削除");
          // Consider providing more specific feedback if deletion fails due to usage
          if (error.message.includes("使用されています")) {
               toast({
                  title: "削除失敗",
                  description: "この科目は時間割で使用されているため削除できません。",
                  variant: "destructive",
                  duration: 5000,
               });
          }
      },
   });


   const handleMutationError = (error: Error, action: string) => {
       console.error(`Failed to ${action} subject:`, error);
       const isOfflineError = error.message.includes("オフラインのため");
       setIsOffline(isOfflineError || !navigator.onLine);
       toast({
         title: isOfflineError ? "オフライン" : "エラー",
         description: isOfflineError ? `科目の${action}に失敗しました。接続を確認してください。` : `科目の${action}に失敗しました: ${error.message}`,
         variant: "destructive",
       });
   };

   // --- Modal Handling ---
   const openAddModal = () => {
      setEditingSubject(null);
      setSubjectName('');
      setTeacherName('');
      setIsModalOpen(true);
   };

   const openEditModal = (subject: Subject) => {
      setEditingSubject(subject);
      setSubjectName(subject.name);
      setTeacherName(subject.teacherName);
      setIsModalOpen(true);
   };

   const handleSave = () => {
       if (isSaving || isOffline) return;
       if (!subjectName.trim() || !teacherName.trim()) {
           toast({ title: "入力エラー", description: "科目名と教員名は必須です。", variant: "destructive" });
           return;
       }

       setIsSaving(true);
       if (editingSubject?.id) {
           // Update existing subject
           updateMutation.mutate({ id: editingSubject.id, name: subjectName, teacher: teacherName });
       } else {
           // Add new subject
           addMutation.mutate({ name: subjectName, teacher: teacherName });
       }
   };

    const handleDelete = (id: string, name: string) => {
        if (isOffline) {
            toast({ title: "オフライン", description: "科目を削除できません。", variant: "destructive" });
            return;
        }
        // Basic confirmation, consider using AlertDialog for better UX
        if (window.confirm(`本当に科目「${name}」を削除しますか？ この操作は元に戻せません。`)) {
             deleteMutation.mutate(id);
        }
    };


  const showLoading = isLoading && !isOffline;
  const showError = error && !isOffline;

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold mb-6">科目管理</h1>

      {isOffline && (
        <Alert variant="destructive" className="mb-6">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>オフライン</AlertTitle>
          <AlertDescription>
            現在オフラインです。科目リストの表示や変更はできません。
          </AlertDescription>
        </Alert>
      )}

      <Card className={`${isOffline ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle>科目リスト</CardTitle>
          <CardDescription>登録されている科目と担当教員の一覧です。</CardDescription>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : showError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>科目の読み込みに失敗しました。</AlertDescription>
            </Alert>
          ) : !subjects || subjects.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">科目が登録されていません。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>科目名</TableHead>
                  <TableHead>担当教員名</TableHead>
                  <TableHead className="text-right w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell className="font-medium">{subject.name}</TableCell>
                    <TableCell>{subject.teacherName}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEditModal(subject)} className="mr-1 h-8 w-8" disabled={isOffline}>
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">編集</span>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(subject.id!, subject.name)} className="text-destructive hover:text-destructive h-8 w-8" disabled={isOffline || deleteMutation.isPending}>
                        <Trash2 className="h-4 w-4" />
                         <span className="sr-only">削除</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={openAddModal} disabled={isOffline || isLoading}>
            <PlusCircle className="mr-2 h-4 w-4" />
            新規科目を追加
          </Button>
        </CardFooter>
      </Card>

      {/* Add/Edit Subject Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSubject ? '科目を編集' : '新規科目を追加'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subjectName" className="text-right">
                科目名
              </Label>
              <Input
                id="subjectName"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="col-span-3"
                placeholder="例: 数学I"
                disabled={isSaving}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="teacherName" className="text-right">
                担当教員名
              </Label>
              <Input
                id="teacherName"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="col-span-3"
                placeholder="例: 山田 太郎"
                disabled={isSaving}
              />
            </div>
          </div>
          <DialogFooter>
             <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={isSaving}>
                      キャンセル
                  </Button>
              </DialogClose>
             <Button onClick={handleSave} disabled={isSaving || isOffline}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? '保存中...' : '保存'}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </MainLayout>
  );
}

export default function SubjectsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <SubjectsPageContent />
    </QueryClientProvider>
  );
}
