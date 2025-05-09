
"use client";

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarIcon, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { addSchoolEvent, updateSchoolEvent } from '@/controllers/timetableController';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { SchoolEvent } from '@/models/timetable';

const eventSchema = z.object({
  title: z.string().min(1, { message: "行事名は必須です。" }),
  startDate: z.date({ required_error: "開始日は必須です。" }),
  endDate: z.date().optional(),
  description: z.string().optional(),
}).refine(data => !data.endDate || data.endDate >= data.startDate, {
  message: "終了日は開始日以降である必要があります。",
  path: ["endDate"],
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onEventSaved: () => Promise<void>; // Changed to Promise<void>
  editingEvent?: SchoolEvent | null;
}

export default function EventFormDialog({ isOpen, onOpenChange, onEventSaved, editingEvent }: EventFormDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      startDate: new Date(),
      description: '',
      endDate: undefined,
    }
  });

  const selectedStartDate = watch("startDate");

  useEffect(() => {
    if (isOpen) {
      if (editingEvent) {
        reset({
          title: editingEvent.title,
          startDate: editingEvent.startDate ? parseISO(editingEvent.startDate) : new Date(),
          endDate: editingEvent.endDate ? parseISO(editingEvent.endDate) : undefined,
          description: editingEvent.description ?? '',
        });
      } else {
        reset({
          title: '',
          startDate: new Date(),
          endDate: undefined,
          description: '',
        });
      }
    }
  }, [isOpen, editingEvent, reset]);


  const addMutation = useMutation({
    mutationFn: (newEvent: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'> & { startDate: string; endDate?: string }) =>
      addSchoolEvent(newEvent, user?.uid ?? 'admin_user_calendar_event_add'),
    onSuccess: async () => {
      toast({ title: "成功", description: "新しい行事を追加しました。" });
      await onEventSaved();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: `行事の追加に失敗しました: ${error.message}`, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (eventToUpdate: SchoolEvent) =>
      updateSchoolEvent(eventToUpdate, user?.uid ?? 'admin_user_calendar_event_update'),
    onSuccess: async () => {
      toast({ title: "成功", description: "行事を更新しました。" });
      await onEventSaved();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: `行事の更新に失敗しました: ${error.message}`, variant: "destructive" });
    },
  });

  const onSubmit = (data: EventFormData) => {
    const formattedData = {
      title: data.title,
      startDate: format(data.startDate, 'yyyy-MM-dd'),
      endDate: data.endDate ? format(data.endDate, 'yyyy-MM-dd') : format(data.startDate, 'yyyy-MM-dd'),
      description: data.description ?? '',
    };

    if (editingEvent && editingEvent.id) {
      updateMutation.mutate({ 
        ...editingEvent, 
        ...formattedData,
        createdAt: editingEvent.createdAt ? (editingEvent.createdAt instanceof Date ? editingEvent.createdAt : new Date(editingEvent.createdAt as any)) : new Date(),
      });
    } else {
      addMutation.mutate(formattedData);
    }
  };
  
  const isMutating = addMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open && !isMutating) reset(); 
        onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editingEvent ? '行事を編集' : '新しい行事を追加'}</DialogTitle>
          <DialogDescription>行事の詳細情報を入力してください。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">行事名</Label>
            <div className="col-span-3">
              <Input id="title" {...register("title")} className={errors.title ? "border-destructive" : ""} disabled={isMutating} />
              {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="startDate" className="text-right">開始日</Label>
            <div className="col-span-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedStartDate && "text-muted-foreground",
                      errors.startDate && "border-destructive"
                    )}
                    disabled={isMutating}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedStartDate ? format(selectedStartDate, "yyyy/MM/dd") : <span>日付を選択</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedStartDate}
                    onSelect={(date) => setValue("startDate", date || new Date(), { shouldValidate: true })}
                    initialFocus
                    locale={ja}
                    disabled={isMutating}
                  />
                </PopoverContent>
              </Popover>
              {errors.startDate && <p className="text-xs text-destructive mt-1">{errors.startDate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="endDate" className="text-right">終了日</Label>
            <div className="col-span-3">
               <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !watch("endDate") && "text-muted-foreground",
                       errors.endDate && "border-destructive"
                    )}
                     disabled={isMutating}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {watch("endDate") ? format(watch("endDate")!, "yyyy/MM/dd") : <span>日付を選択 (任意)</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={watch("endDate")}
                    onSelect={(date) => setValue("endDate", date, { shouldValidate: true })}
                    initialFocus
                    locale={ja}
                    disabled={(date) => (selectedStartDate && date < selectedStartDate) || isMutating}
                  />
                </PopoverContent>
              </Popover>
              {errors.endDate && <p className="text-xs text-destructive mt-1">{errors.endDate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">詳細</Label>
            <div className="col-span-3">
              <Textarea id="description" {...register("description")} placeholder="行事の詳細な説明 (任意)" disabled={isMutating}/>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { onOpenChange(false); if(!isMutating) reset(); }} disabled={isMutating}>キャンセル</Button>
            <Button type="submit" disabled={isMutating}>
              <Save className="mr-2 h-4 w-4" />
              {isMutating ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

