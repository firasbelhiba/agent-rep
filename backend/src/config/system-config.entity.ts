import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('system_config')
export class SystemConfigEntity {
  @PrimaryColumn()
  key: string;

  @Column()
  value: string;
}
