
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, isValid, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarIcon, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Assignment, AssignmentDuePeriod } from '@/models/assignment';
import { AssignmentDuePeriods } from '@/models/assignment';
import type { Subject } from '@/models/subject';
import { addAssignment, updateAssignment } from '@/controllers/assignmentController';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { TimetableSettings, FixedTimeSlot, DayOfWeek } from '@/models/timetable';
import { DEFAULT_TIMETABLE_SETTINGS, dayCodeToDayOfWeekEnum } from '@/models/timetable';
import type { DailyAnnouncement } from '@/models/announcement';
import { queryFnGetTimetableSettings, queryFnGetFixedTimetable, queryFnGetDailyAnnouncements } from '@/controllers/timetableController';

const SUBJECT_NONE_VALUE = "__SUBJECT_NONE__";
const SUBJECT_OTHER_VALUE = "__OTHER__";
const PERIOD_NONE_VALUE = "__NO_PERIOD__";

const assignmentFormSchema = z.object({
  title: z.string().min(1, { message: "課題名は必須です。" }).max(100, { message: "課題名は100文字以内で入力してください。"}),
  description: z.string().min(1, { message: "内容は必須です。" }).max(2000, { message: "内容は2000文字以内で入力してください。"}),
  subjectId: z.string().nullable().optional(),
  customSubjectName: z.string().max(50, {message: "科目名は50文字以内"}).optional().nullable(),
  dueDate: z.date({ required_error: "提出期限日は必須です。" }),
  duePeriod: z.string().nullable().optional(), // Changed to string to allow custom value for period + subject
  submissionMethod: z.string().max(100, {message: "提出方法は100文字以内"}).optional().nullable(),
  targetAudience: z.string().max(100, {message: "対象者は100文字以内"}).optional().nullable(),
}).refine(data => {
    if (data.subjectId === SUBJECT_OTHER_VALUE && (!data.customSubjectName || data.customSubjectName.trim() === "")) {
        return false;
    }
    return true;
}, {
    message: "「その他」を選択した場合は、科目名を入力してください。",
    path: ["customSubjectName"],
});


type AssignmentFormData = z.infer<typeof assignmentFormSchema>;

interface AssignmentFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  subjects: Subject[];
  editingAssignment?: Assignment | null;
  onFormSubmitSuccess: () => void;
}

export default function AssignmentFormDialog({
  isOpen,
  onOpenChange,
  subjects,
  editingAssignment,
  onFormSubmitSuccess,
}: AssignmentFormDialogProps) {
  const { toast } = useToast();
  const { user, isAnonymous } = useAuth();
  const queryClientHook = useQueryClient();

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors, isSubmitting: isFormSubmitting } } = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      title: '',
      description: '',
      subjectId: null,
      customSubjectName: '',
      dueDate: new Date(),
      duePeriod: null,
      submissionMethod: '',
      targetAudience: '',
    }
  });

  const watchedSubjectId = watch("subjectId");
  const watchedDueDate = watch("dueDate");

  const [subjectsForPeriodsDisplay, setSubjectsForPeriodsDisplay] = useState<Record<number, string | null>>({});

  const { data: settingsData } = useQuery<TimetableSettings, Error>({
    queryKey: ['timetableSettings'],
    queryFn: queryFnGetTimetableSettings,
    staleTime: Infinity,
  });
  const settings = settingsData ?? DEFAULT_TIMETABLE_SETTINGS;

  const { data: fixedTimetableData } = useQuery<FixedTimeSlot[], Error>({
    queryKey: ['fixedTimetable'],
    queryFn: queryFnGetFixedTimetable,
    staleTime: Infinity,
  });

  const subjectsMap = useMemo(() => new Map(subjects.map(s => [s.id, s.name])), [subjects]);

  useEffect(() => {
    if (isOpen) {
      if (editingAssignment) {
        reset({
          title: editingAssignment.title,
          description: editingAssignment.description,
          subjectId: editingAssignment.subjectId === null && editingAssignment.customSubjectName ? SUBJECT_OTHER_VALUE : editingAssignment.subjectId,
          customSubjectName: editingAssignment.customSubjectName ?? '',
          dueDate: editingAssignment.dueDate && isValid(parseISO(editingAssignment.dueDate)) ? parseISO(editingAssignment.dueDate) : new Date(),
          duePeriod: editingAssignment.duePeriod ?? null,
          submissionMethod: editingAssignment.submissionMethod ?? '',
          targetAudience: editingAssignment.targetAudience ?? '',
        });
      } else {
        reset({
          title: '',
          description: '',
          subjectId: null,
          customSubjectName: '',
          dueDate: new Date(),
          duePeriod: null,
          submissionMethod: '',
          targetAudience: '',
        });
      }
    }
  }, [isOpen, editingAssignment, reset]);

  useEffect(() => {
    const fetchAndSetPeriodSubjects = async () => {
      if (!watchedDueDate || !isValid(watchedDueDate) || !settings || !fixedTimetableData || !subjectsMap) {
        setSubjectsForPeriodsDisplay({});
        return;
      }

      const dateStr = format(watchedDueDate, 'yyyy-MM-dd');
      const dayOfWeek = dayCodeToDayOfWeekEnum(getDay(watchedDueDate));
      let dailyAnnouncements: DailyAnnouncement[] = [];
      try {
        dailyAnnouncements = await queryClientHook.fetchQuery({
          queryKey: ['dailyAnnouncements', dateStr],
          queryFn: queryFnGetDailyAnnouncements(dateStr),
        });
      } catch (e) {
        console.error("Failed to fetch daily announcements for due date subjects", e);
      }
      
      const announcementsMap = new Map(dailyAnnouncements.map(ann => [ann.period, ann]));
      const periodSubjects: Record<number, string | null> = {};

      for (let i = 1; i <= settings.numberOfPeriods; i++) {
        const fixedSlot = fixedTimetableData.find(slot => slot.day === dayOfWeek && slot.period === i);
        const announcement = announcementsMap.get(i);
        let finalSubjectId: string | null = fixedSlot?.subjectId ?? null;

        if (announcement && !announcement.isManuallyCleared) {
          if (announcement.subjectIdOverride === "") { // Explicitly cleared
            finalSubjectId = null;
          } else if (announcement.subjectIdOverride !== null && announcement.subjectIdOverride !== undefined) {
            finalSubjectId = announcement.subjectIdOverride;
          }
        } else if (announcement && announcement.isManuallyCleared) {
            finalSubjectId = fixedSlot?.subjectId ?? null;
        }
        periodSubjects[i] = finalSubjectId ? (subjectsMap.get(finalSubjectId) ?? '不明な科目') : null;
      }
      setSubjectsForPeriodsDisplay(periodSubjects);
    };

    if (isOpen) {
      fetchAndSetPeriodSubjects();
    }
  }, [watchedDueDate, settings, fixedTimetableData, subjectsMap, queryClientHook, isOpen]);


  const userIdForLog = user?.uid ?? (isAnonymous ? 'anonymous_assignment_form' : 'system_assignment_form');

  const mutation = useMutation({
    mutationFn: (data: AssignmentFormData) => {
      const payload: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'itemType'> = {
        title: data.title,
        description: data.description,
        subjectId: data.subjectId === SUBJECT_OTHER_VALUE || data.subjectId === SUBJECT_NONE_VALUE ? null : data.subjectId,
        customSubjectName: data.subjectId === SUBJECT_OTHER_VALUE ? data.customSubjectName : null,
        dueDate: format(data.dueDate, 'yyyy-MM-dd'),
        duePeriod: data.duePeriod === PERIOD_NONE_VALUE ? null : data.duePeriod as AssignmentDuePeriod,
        submissionMethod: data.submissionMethod || null,
        targetAudience: data.targetAudience || null,
      };
      if (editingAssignment?.id) {
        return updateAssignment(editingAssignment.id, payload, userIdForLog);
      } else {
        return addAssignment(payload, userIdForLog);
      }
    },
    onSuccess: async () => {
      toast({ title: "成功", description: `課題を${editingAssignment ? '更新' : '追加'}しました。` });
      onFormSubmitSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: `課題の${editingAssignment ? '更新' : '追加'}に失敗: ${error.message}`, variant: "destructive" });
    },
  });

  const onSubmit = (data: AssignmentFormData) => {
    mutation.mutate(data);
  };

  const isProcessing = isFormSubmitting || mutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!isProcessing) onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingAssignment ? '課題を編集' : '新しい課題を追加'}</DialogTitle>
          <DialogDescription>課題の詳細情報を入力してください。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Title */}
          <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
            <Label htmlFor="title" className="text-right pt-2 col-span-1">課題名</Label>
            <div className="col-span-3">
              <Input id="title" {...register("title")} className={errors.title ? "border-destructive" : ""} disabled={isProcessing} />
              {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
            </div>
          </div>

          {/* Subject */}
           <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
            <Label htmlFor="subjectId" className="text-right pt-2 col-span-1">科目</Label>
            <div className="col-span-3">
                <Controller
                    name="subjectId"
                    control={control}
                    render={({ field }) => (
                        <Select
                            value={field.value === null ? SUBJECT_NONE_VALUE : field.value || SUBJECT_NONE_VALUE}
                            onValueChange={(val) => {
                                if (val === SUBJECT_NONE_VALUE) field.onChange(null);
                                else field.onChange(val);
                            }}
                            disabled={isProcessing}
                        >
                            <SelectTrigger className={errors.subjectId ? "border-destructive" : ""}>
                                <SelectValue placeholder="科目を選択"/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={SUBJECT_NONE_VALUE}>指定なし (科目共通など)</SelectItem>
                                {subjects.map(s => <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>)}
                                <SelectItem value={SUBJECT_OTHER_VALUE}>その他 (学校提出など)</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                />
              {errors.subjectId && <p className="text-xs text-destructive mt-1">{errors.subjectId.message}</p>}
            </div>
          </div>

          {/* Custom Subject Name (if "Other" is selected) */}
          {watchedSubjectId === SUBJECT_OTHER_VALUE && (
            <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
              <Label htmlFor="customSubjectName" className="text-right pt-2 col-span-1">科目名(自由入力)</Label>
              <div className="col-span-3">
                <Input id="customSubjectName" {...register("customSubjectName")} className={errors.customSubjectName ? "border-destructive" : ""} disabled={isProcessing} placeholder="例: ポートフォリオ" />
                {errors.customSubjectName && <p className="text-xs text-destructive mt-1">{errors.customSubjectName.message}</p>}
              </div>
            </div>
          )}


          {/* Due Date */}
          <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
            <Label htmlFor="dueDate" className="text-right pt-2 col-span-1">提出期限</Label>
            <div className="col-span-3">
                <Controller
                    name="dueDate"
                    control={control}
                    render={({ field }) => (
                        <Popover>
                            <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground", errors.dueDate && "border-destructive")}
                                disabled={isProcessing}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "yyyy/MM/dd") : <span>日付を選択</span>}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ja} disabled={isProcessing}/>
                            </PopoverContent>
                        </Popover>
                    )}
                />
              {errors.dueDate && <p className="text-xs text-destructive mt-1">{errors.dueDate.message}</p>}
            </div>
          </div>

          {/* Due Period */}
          <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
            <Label htmlFor="duePeriod" className="text-right pt-2 col-span-1">提出時限 (任意)</Label>
             <div className="col-span-3">
                <Controller
                    name="duePeriod"
                    control={control}
                    render={({ field }) => (
                        <Select
                            value={field.value ?? PERIOD_NONE_VALUE}
                            onValueChange={(val) => {
                                if (val === PERIOD_NONE_VALUE) field.onChange(null);
                                else field.onChange(val as AssignmentDuePeriod);
                            }}
                            disabled={isProcessing}
                        >
                            <SelectTrigger className={errors.duePeriod ? "border-destructive" : ""}>
                                <SelectValue placeholder="時限を選択 (任意)"/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={PERIOD_NONE_VALUE}>指定なし</SelectItem>
                                {AssignmentDuePeriods.map((p, index) => {
                                    const periodNumber = parseInt(p.match(/\d+/)?.[0] ?? '0');
                                    const subjectNameForPeriod = periodNumber > 0 && subjectsForPeriodsDisplay[periodNumber]
                                        ? subjectsForPeriodsDisplay[periodNumber]
                                        : (p === "朝ST+1" && subjectsForPeriodsDisplay[1] ? subjectsForPeriodsDisplay[1] : null); // For "朝ST+1", check 1st period's subject
                                    
                                    const displayLabel = subjectNameForPeriod
                                        ? `${p} (${subjectNameForPeriod})`
                                        : p;

                                    return (
                                        <SelectItem key={p} value={p}>
                                            {displayLabel}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    )}
                />
                 {errors.duePeriod && <p className="text-xs text-destructive mt-1">{errors.duePeriod.message}</p>}
            </div>
          </div>

          {/* Description */}
          <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
            <Label htmlFor="description" className="text-right pt-2 col-span-1">内容</Label>
            <div className="col-span-3">
              <Textarea id="description" {...register("description")} placeholder="課題の詳細、範囲、注意点など" className={`min-h-[100px] ${errors.description ? "border-destructive" : ""}`} disabled={isProcessing} />
              {errors.description && <p className="text-xs text-destructive mt-1">{errors.description.message}</p>}
            </div>
          </div>

          {/* Submission Method (Optional) */}
          <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
            <Label htmlFor="submissionMethod" className="text-right pt-2 col-span-1">提出方法 (任意)</Label>
            <div className="col-span-3">
              <Input id="submissionMethod" {...register("submissionMethod")} placeholder="例: Teamsで提出, 授業中にノート提出" className={errors.submissionMethod ? "border-destructive" : ""} disabled={isProcessing} />
              {errors.submissionMethod && <p className="text-xs text-destructive mt-1">{errors.submissionMethod.message}</p>}
            </div>
          </div>

          {/* Target Audience (Optional) */}
          <div className="grid grid-cols-4 items-start gap-x-4 gap-y-1">
            <Label htmlFor="targetAudience" className="text-right pt-2 col-span-1">対象者 (任意)</Label>
            <div className="col-span-3">
              <Input id="targetAudience" {...register("targetAudience")} placeholder="例: 全員, 前半, 〇〇受講者" className={errors.targetAudience ? "border-destructive" : ""} disabled={isProcessing} />
              {errors.targetAudience && <p className="text-xs text-destructive mt-1">{errors.targetAudience.message}</p>}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isProcessing}>キャンセル</Button>
            <Button type="submit" disabled={isProcessing}>
              <Save className="mr-2 h-4 w-4" />
              {isProcessing ? "保存中..." : (editingAssignment ? "更新" : "追加")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

