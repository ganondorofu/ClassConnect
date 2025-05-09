"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
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
import { addSchoolEvent } from '@/controllers/timetableController';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

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

interface AddEventDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onEventAdded: () => void;
}

export default function AddEventDialog({ isOpen, onOpenChange, onEventAdded }: AddEventDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      startDate: new Date(),
      description: '',
    }
  });
  const selectedStartDate = watch("startDate");


  const mutation = useMutation({
    mutationFn: (newEvent: Omit<z.infer<typeof eventSchema> & { startDate: string; endDate?: string }, 'id'>) => 
      addSchoolEvent(newEvent, user?.uid ?? 'admin_user_calendar'),
    onSuccess: () => {
      toast({ title: "成功", description: "新しい行事を追加しました。" });
      onEventAdded();
      onOpenChange(false);
      reset();
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: `行事の追加に失敗しました: ${error.message}`, variant: "destructive" });
    },
  });

  const onSubmit = (data: EventFormData) => {
    const formattedData = {
      ...data,
      startDate: format(data.startDate, 'yyyy-MM-dd'),
      endDate: data.endDate ? format(data.endDate, 'yyyy-MM-dd') : format(data.startDate, 'yyyy-MM-dd'),
      description: data.description ?? '',
    };
    mutation.mutate(formattedData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) reset(); // Reset form when dialog closes
        onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>新しい行事を追加</DialogTitle>
          <DialogDescription>行事の詳細情報を入力してください。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">行事名</Label>
            <div className="col-span-3">
              <Input id="title" {...register("title")} className={errors.title ? "border-destructive" : ""} />
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
                    disabled={(date) => selectedStartDate && date < selectedStartDate }
                  />
                </PopoverContent>
              </Popover>
              {errors.endDate && <p className="text-xs text-destructive mt-1">{errors.endDate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">詳細</Label>
            <div className="col-span-3">
              <Textarea id="description" {...register("description")} placeholder="行事の詳細な説明 (任意)" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { onOpenChange(false); reset(); }}>キャンセル</Button>
            <Button type="submit" disabled={mutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {mutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
