
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Assignment, GetAssignmentsFilters, GetAssignmentsSort, AssignmentDuePeriod } from '@/models/assignment';
import { AssignmentDuePeriods } from '@/models/assignment';
import type { Subject } from '@/models/subject';
import { queryFnGetSubjects } from '@/controllers/subjectController';
import { queryFnGetAssignments, addAssignment, updateAssignment, deleteAssignment, toggleAssignmentCompletion, onAssignmentsUpdate } from '@/controllers/assignmentController';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PlusCircle, Edit, Trash2, Filter, AlertCircle, WifiOff, ChevronUp, ChevronDown, CalendarIcon, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AssignmentFormDialog from '@/components/assignments/AssignmentFormDialog';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { areArraysOfObjectsEqual } from '@/lib/utils';

const queryClient = new QueryClient();

const ALL_SUBJECTS_VALUE = "__ALL_SUBJECTS__";
const OTHER_SUBJECT_VALUE = "__OTHER__";
const ALL_PERIODS_VALUE = "__ALL_PERIODS__";

function AssignmentsPageContent() {
  const [isOffline, setIsOffline] = useState(false);
  const queryClientHook = useQueryClient();
  const { toast } = useToast();
  const { user, isAnonymous } = useAuth();

  const [filters, setFilters] = useState<GetAssignmentsFilters>({ isCompleted: false });
  const [sort, setSort] = useState<GetAssignmentsSort>({ field: 'dueDate', direction: 'asc' });
  
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  const [liveAssignments, setLiveAssignments] = useState<Assignment[] | undefined>(undefined);


  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    if (typeof navigator !== 'undefined' && navigator.onLine !== undefined) {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
    return () => {};
  }, []);
  
  const handleQueryError = (queryKey: string) => (error: unknown) => {
    console.error(`Assignments Query Error (${queryKey}):`, error);
    const isFirestoreUnavailable = (error as any)?.code === 'unavailable';
    setIsOffline(isFirestoreUnavailable || (typeof navigator !== 'undefined' && !navigator.onLine));
  };

  const { data: initialAssignments, isLoading, error: queryError, refetch } = useQuery<Assignment[], Error>({
    queryKey: ['assignments', filters, sort],
    queryFn: queryFnGetAssignments(filters, sort),
    staleTime: 1000 * 60 * 1, 
    enabled: !isOffline && (!!user || isAnonymous),
    onError: handleQueryError('assignments'),
  });
  
  useEffect(() => {
    if (isOffline || (!user && !isAnonymous)) return;
    const unsubscribe = onAssignmentsUpdate(
      (newAssignments) => {
        setLiveAssignments(prev => areArraysOfObjectsEqual(prev, newAssignments) ? prev : newAssignments);
      },
      (err) => {
        console.error("Realtime assignments error:", err);
        handleQueryError('assignments-realtime')(err);
      },
      filters, 
      sort
    );
    return () => unsubscribe();
  }, [isOffline, user, isAnonymous, filters, sort]);

  const assignments = useMemo(() => liveAssignments !== undefined ? liveAssignments : initialAssignments ?? [], [liveAssignments, initialAssignments]);


  const { data: subjects } = useQuery<Subject[], Error>({
    queryKey: ['subjects'],
    queryFn: queryFnGetSubjects,
    staleTime: Infinity,
    enabled: !isOffline && (!!user || isAnonymous),
    onError: handleQueryError('subjectsForAssignments'),
  });
  const subjectsMap = useMemo(() => new Map(subjects?.map(s => [s.id, s.name])), [subjects]);

  const userIdForLog = user?.uid ?? (isAnonymous ? 'anonymous_assignment_op' : 'system_assignment_op');

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) => deleteAssignment(assignmentId, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "課題を削除しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['assignments'] });
      await queryClientHook.invalidateQueries({ queryKey: ['calendarItems'] });
    },
    onError: (err: Error) => {
      toast({ title: "削除失敗", description: err.message, variant: "destructive" });
      if (err.message.includes("オフライン")) setIsOffline(true);
    },
  });

  const toggleCompletionMutation = useMutation({
    mutationFn: ({ assignmentId, completed }: { assignmentId: string; completed: boolean }) => 
      toggleAssignmentCompletion(assignmentId, completed, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "課題の完了状態を更新しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['assignments'] }); 
    },
    onError: (err: Error) => {
      toast({ title: "更新失敗", description: err.message, variant: "destructive" });
       if (err.message.includes("オフライン")) setIsOffline(true);
    },
  });
  
  const handleOpenFormModal = (assignment?: Assignment) => {
    setEditingAssignment(assignment || null);
    setIsFormModalOpen(true);
  };
  
  const handleSort = (field: GetAssignmentsSort['field']) => {
    setSort(prevSort => ({
      field,
      direction: prevSort.field === field && prevSort.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIndicator = ({ field }: { field: GetAssignmentsSort['field'] }) => {
    if (sort.field !== field) return null;
    return sort.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  const renderTableHeaders = () => (
    <TableRow>
      <TableHead className="w-[50px] text-center">完了</TableHead>
      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('title')}>
        <div className="flex items-center gap-1">課題名 <SortIndicator field="title" /></div>
      </TableHead>
      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('subjectId')}>
         <div className="flex items-center gap-1">科目 <SortIndicator field="subjectId" /></div>
      </TableHead>
      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('dueDate')}>
        <div className="flex items-center gap-1">提出期限 <SortIndicator field="dueDate" /></div>
      </TableHead>
      <TableHead>提出時限</TableHead>
      <TableHead>内容詳細</TableHead>
      <TableHead className="w-[100px] text-right">操作</TableHead>
    </TableRow>
  );

  const canPerformActions = user || isAnonymous;

  if (!user && !isAnonymous && !isLoading) {
     return (
      <MainLayout>
        <Alert variant="default" className="mt-4">
            <Info className="h-4 w-4" />
            <AlertTitle>課題一覧の表示</AlertTitle>
            <AlertDescription>
                ログインまたは「ログインなしで利用」を選択すると、課題一覧が表示されます。
            </AlertDescription>
        </Alert>
      </MainLayout>
    );
  }


  return (
    <MainLayout>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
        <h1 className="text-2xl font-semibold">課題一覧</h1>
        {canPerformActions && (
            <Button onClick={() => handleOpenFormModal()} size="sm" disabled={isOffline}>
            <PlusCircle className="mr-2 h-4 w-4" /> 新規課題を追加
            </Button>
        )}
      </div>

      {isOffline && (
        <Alert variant="destructive" className="mb-4">
          <WifiOff className="h-4 w-4" /><AlertTitle>オフライン</AlertTitle>
          <AlertDescription>現在オフラインです。課題の表示や操作が制限される場合があります。</AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">フィルタリングと検索</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Input
            placeholder="タイトル・内容で検索..."
            value={filters.searchTerm || ''}
            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
            disabled={isOffline}
          />
          <Select
            value={filters.subjectId === undefined ? ALL_SUBJECTS_VALUE : (filters.subjectId === null ? OTHER_SUBJECT_VALUE : filters.subjectId)}
            onValueChange={(value) => setFilters(prev => ({ 
              ...prev, 
              subjectId: value === ALL_SUBJECTS_VALUE 
                ? undefined 
                : (value === OTHER_SUBJECT_VALUE ? null : value) 
            }))}
            disabled={isOffline || !subjects}
          >
            <SelectTrigger><SelectValue placeholder="科目で絞り込み" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SUBJECTS_VALUE}>全ての科目</SelectItem>
              <SelectItem value={OTHER_SUBJECT_VALUE}>その他 (学校提出など)</SelectItem>
              {subjects?.map(s => <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn("w-full justify-start text-left font-normal", !filters.dueDateStart && "text-muted-foreground")}
                disabled={isOffline}
              > <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dueDateStart ? format(parseISO(filters.dueDateStart), "yyyy/MM/dd") : <span>開始日で絞り込み</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filters.dueDateStart ? parseISO(filters.dueDateStart) : undefined} onSelect={(date) => setFilters(prev => ({ ...prev, dueDateStart: date ? format(date, 'yyyy-MM-dd') : null }))} /></PopoverContent>
          </Popover>
           <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn("w-full justify-start text-left font-normal", !filters.dueDateEnd && "text-muted-foreground")}
                disabled={isOffline}
              > <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dueDateEnd ? format(parseISO(filters.dueDateEnd), "yyyy/MM/dd") : <span>終了日で絞り込み</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filters.dueDateEnd ? parseISO(filters.dueDateEnd) : undefined} onSelect={(date) => setFilters(prev => ({ ...prev, dueDateEnd: date ? format(date, 'yyyy-MM-dd') : null }))} /></PopoverContent>
          </Popover>
           <Select
            value={filters.duePeriod === null || filters.duePeriod === undefined ? ALL_PERIODS_VALUE : filters.duePeriod}
            onValueChange={(value) => setFilters(prev => ({ ...prev, duePeriod: value === ALL_PERIODS_VALUE ? null : (value as AssignmentDuePeriod) }))}
            disabled={isOffline}
          >
            <SelectTrigger><SelectValue placeholder="提出時限で絞り込み" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PERIODS_VALUE}>全ての時限</SelectItem>
              {AssignmentDuePeriods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="showCompletedFilter"
              checked={filters.isCompleted === true}
              onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isCompleted: checked === true ? true : (prev.isCompleted === false ? null : false) }))} 
              disabled={isOffline}
            />
            <label htmlFor="showCompletedFilter" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              完了済みのみ表示
            </label>
          </div>
           <div className="flex items-center space-x-2">
            <Checkbox
              id="showActiveFilter"
              checked={filters.isCompleted === false}
              onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isCompleted: checked === true ? false : (prev.isCompleted === true ? null : true) }))}
              disabled={isOffline}
            />
            <label htmlFor="showActiveFilter" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              未完了のみ表示
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>登録されている課題</CardTitle>
          <CardDescription>提出期限や内容を確認し、完了状態を更新できます。</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !isOffline ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : queryError && !isOffline ? (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>エラー</AlertTitle><AlertDescription>課題一覧の読み込みに失敗しました。</AlertDescription></Alert>
          ) : !assignments || assignments.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">該当する課題はありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>{renderTableHeaders()}</TableHeader>
                <TableBody>
                  {assignments.map((assignment) => (
                    <TableRow key={assignment.id} className={assignment.isCompleted ? "bg-muted/30 dark:bg-muted/20" : ""}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={assignment.isCompleted}
                          onCheckedChange={(checked) => toggleCompletionMutation.mutate({ assignmentId: assignment.id!, completed: !!checked })}
                          disabled={!canPerformActions || toggleCompletionMutation.isPending || isOffline}
                          aria-label={`課題「${assignment.title}」を完了済みにする`}
                        />
                      </TableCell>
                      <TableCell className={`font-medium ${assignment.isCompleted ? "line-through text-muted-foreground" : ""}`}>{assignment.title}</TableCell>
                      <TableCell>{assignment.subjectId ? subjectsMap.get(assignment.subjectId) : (assignment.customSubjectName || 'その他')}</TableCell>
                      <TableCell>{format(parseISO(assignment.dueDate), 'yyyy/MM/dd (E)', { locale: ja })}</TableCell>
                      <TableCell>{assignment.duePeriod || <span className="text-xs text-muted-foreground italic">指定なし</span>}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={assignment.description}>
                        {assignment.description && assignment.description.length > 50 ? assignment.description.substring(0,50) + "..." : assignment.description}
                      </TableCell>
                      <TableCell className="text-right">
                        {canPerformActions && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenFormModal(assignment)} className="mr-1 h-8 w-8" disabled={isOffline}>
                              <Edit className="h-4 w-4" /><span className="sr-only">編集</span>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" disabled={isOffline || deleteMutation.isPending}>
                                  <Trash2 className="h-4 w-4" /><span className="sr-only">削除</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>本当に課題「{assignment.title}」を削除しますか？</AlertDialogTitle><AlertDialogDescription>この操作は元に戻せません。</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(assignment.id!)}>削除</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isFormModalOpen && canPerformActions && (
        <AssignmentFormDialog
          isOpen={isFormModalOpen}
          onOpenChange={setIsFormModalOpen}
          subjects={subjects || []}
          editingAssignment={editingAssignment}
          onFormSubmitSuccess={async () => {
             setIsFormModalOpen(false);
             await queryClientHook.invalidateQueries({ queryKey: ['assignments'] });
             await queryClientHook.invalidateQueries({ queryKey: ['calendarItems'] });
          }}
        />
      )}
    </MainLayout>
  );
}

export default function AssignmentsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <AssignmentsPageContent />
    </QueryClientProvider>
  );
}
